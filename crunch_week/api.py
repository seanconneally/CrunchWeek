"""FastAPI service and optional production React static host."""

from __future__ import annotations

import os
import sqlite3
import threading
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Annotated, Literal
from uuid import UUID
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import Field, ValidationError, field_validator
from starlette.concurrency import run_in_threadpool
from starlette.middleware.trustedhost import TrustedHostMiddleware

from crunch_week.ai_config import AIConfigurationError, ai_status, chat_status, load_ai_config, load_chat_config
from crunch_week.app_help import local_help
from crunch_week.assistant import (
    AssistantError,
    ChatMessage,
    Interpretation,
    Proposal,
    apply_proposal,
    build_proposal,
    interpret,
    review_proposal,
)
from crunch_week.chat_usage import ChatUsage, DailyChatBudget, DailyLimitError
from crunch_week.demo import demo_project
from crunch_week.documents import MAX_BYTES, DocumentError, read_document
from crunch_week.estimates import check_in
from crunch_week.exports import calendar_export, csv_export
from crunch_week.extraction import ExtractionError, extract_document, merge_assessments
from crunch_week.models import Model, Project, Settings, new_project
from crunch_week.notion import NotionClient, NotionError
from crunch_week.planner import build_plan, review_warnings, weekly_summary
from crunch_week.progress import study_action
from crunch_week.recovery import apply_recovery, recovery_options

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env", override=False)
notion_lock = threading.Lock()
extraction_lock = threading.Lock()
assistant_lock = threading.Lock()
chat_budget = DailyChatBudget(Path(os.environ.get("CRUNCH_WEEK_DATA_DIR", str(ROOT / ".local"))) / "chat_usage.sqlite3")


class BodyLimitMiddleware:
    """Bound the received body, including chunked uploads, before multipart parsing."""

    def __init__(self, app, max_bytes: int = MAX_BYTES + 1024 * 1024):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] not in {"POST", "PUT", "PATCH"}:
            return await self.app(scope, receive, send)
        messages = []
        length = 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            length += len(message.get("body", b""))
            if length > self.max_bytes:
                return await JSONResponse(
                    {"detail": "Request too large. Maximum file size is 10 MB."}, status_code=413
                )(scope, receive, send)
            messages.append(message)
            if not message.get("more_body", False):
                break
        iterator = iter(messages)

        async def replay():
            return next(iterator, {"type": "http.request", "body": b"", "more_body": False})

        return await self.app(scope, replay, send)


def browser_request(x_crunch_week: Annotated[str | None, Header()] = None) -> None:
    # Forces cross-origin browser requests through CORS preflight; blocks plain form CSRF.
    if x_crunch_week != "1":
        raise HTTPException(403, "Missing X-Crunch-Week request header.")


app = FastAPI(title="Crunch Week API", version="1.0.0", docs_url="/api/docs", openapi_url="/api/openapi.json")
app.add_middleware(BodyLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-Crunch-Week"],
)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1").split(","))


@app.exception_handler(RequestValidationError)
async def validation_handler(request, exc):
    errors = [{"field": ".".join(map(str, error["loc"])), "message": error["msg"]} for error in exc.errors()]
    return JSONResponse({"detail": errors}, status_code=422)


@app.exception_handler(DocumentError)
@app.exception_handler(AIConfigurationError)
@app.exception_handler(ExtractionError)
@app.exception_handler(NotionError)
async def known_error_handler(request, exc):
    return JSONResponse({"detail": str(exc)}, status_code=400)


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Frame-Options"] = "DENY"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/config")
def config():
    return {
        **ai_status(),
        **chat_status(),
        "notion_configured": bool(os.getenv("NOTION_TOKEN")),
        "max_file_mb": 10,
        "parent_configured": bool(os.getenv("NOTION_PARENT_PAGE_ID")),
    }


@app.get("/api/project/new", response_model=Project)
def empty_project():
    return new_project(datetime.now(ZoneInfo("Europe/Dublin")).date())


@app.get("/api/demo", response_model=Project)
def demo():
    return demo_project(datetime.now(ZoneInfo("Europe/Dublin")).date())


@app.post("/api/project/validate", dependencies=[Depends(browser_request)], response_model=Project)
def validate_project(project: Project):
    return project


@app.post("/api/plan", dependencies=[Depends(browser_request)])
def plan(project: Project):
    now = datetime.now(ZoneInfo(project.settings.timezone))
    result = build_plan(project, now)
    return {"plan": result, "planned_at": now, "weeks": weekly_summary(project, result, now), "warnings": review_warnings(project)}


@app.post("/api/recovery", dependencies=[Depends(browser_request)])
def recovery(project: Project):
    return recovery_options(project, datetime.now(ZoneInfo(project.settings.timezone)))


class RecoveryRequest(Model):
    project: Project
    option_id: Literal["buffer", "extra", "combined"]
    expected_settings: Settings


@app.post("/api/recovery/apply", dependencies=[Depends(browser_request)], response_model=Project)
def recover(request: RecoveryRequest):
    try:
        updated = apply_recovery(request.project, request.option_id, datetime.now(ZoneInfo(request.project.settings.timezone)))
        if updated.settings != request.expected_settings:
            raise ValueError("Available time changed since this comparison. Compare again before applying.")
        return updated
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc


class StudyActionRequest(Model):
    project: Project
    action: Literal["done", "skipped", "undo"]
    block_id: UUID
    planned_at: datetime

    @field_validator("planned_at")
    @classmethod
    def aware_time(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("Planning time must include a timezone.")
        return value


@app.post("/api/study/action", dependencies=[Depends(browser_request)], response_model=Project)
def update_study(request: StudyActionRequest):
    try:
        return study_action(request.project, request.action, str(request.block_id), request.planned_at)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc


class CheckInRequest(Model):
    project: Project
    assessment_id: UUID
    activity_id: UUID
    status: Literal["on_track", "need_more_time", "finished"]
    expected_remaining: int = Field(ge=0, le=12000, multiple_of=30)
    remaining_minutes: int | None = Field(default=None, ge=0, le=12000, multiple_of=30)


@app.post("/api/estimates/check-in", dependencies=[Depends(browser_request)], response_model=Project)
def estimate_check_in(request: CheckInRequest):
    try:
        return check_in(request.project, request.assessment_id, request.activity_id, request.status,
                        request.expected_remaining, request.remaining_minutes)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc


class ChatRequest(Model):
    expected_provider: Literal["ollama", "ollama_cloud", "azure", "openai"] | None = None
    project: Project
    messages: list[ChatMessage] = Field(min_length=1, max_length=12)
    consent: bool


class ProposalRequest(Model):
    project: Project
    proposal: Proposal


@app.get("/api/assistant/usage", response_model=ChatUsage)
def assistant_usage():
    try:
        return chat_budget.status(datetime.now().astimezone())
    except (OSError, sqlite3.Error) as exc:
        raise HTTPException(503, "Chat usage could not be loaded. Direct edits remain available.") from exc


@app.post("/api/assistant/propose", dependencies=[Depends(browser_request)], response_model=Proposal)
async def propose_change(request: ChatRequest):
    if request.messages[-1].role != "user":
        raise HTTPException(400, "Send a message describing your schedule change or app question.")
    help_answer = local_help(request.messages[-1].content)
    if help_answer is None and not request.consent:
        raise HTTPException(400, "Confirm that your message and limited planning context may be sent to your AI provider.")
    config = load_chat_config() if help_answer is None else None
    if config and request.expected_provider and config.provider != request.expected_provider:
        raise HTTPException(409, "The chat provider changed. Reload the app and review the new consent notice before sending. No message was sent.")
    if not assistant_lock.acquire(blocking=False):
        raise HTTPException(409, "Another chat request is running. Please wait before retrying.")
    try:
        now = datetime.now(ZoneInfo(request.project.settings.timezone))
        usage = chat_budget.reserve(now)
        if help_answer:
            topic, answer = help_answer
            draft = Interpretation(intent="help", help_topic=topic, message=answer, questions=[], commitments=[], effort_changes=[])
        else:
            draft = await run_in_threadpool(interpret, request.project, request.messages, config, now)
        proposal = build_proposal(request.project, draft, now)
        proposal.usage = usage
        return proposal
    except DailyLimitError as exc:
        raise HTTPException(429, str(exc)) from exc
    except (OSError, sqlite3.Error) as exc:
        raise HTTPException(503, "Chat usage could not be saved. No AI request was sent; direct edits remain available.") from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc) if isinstance(exc, AssistantError) else "Invalid proposed change. Your plan has not changed.") from exc
    finally:
        assistant_lock.release()


@app.post("/api/assistant/review", dependencies=[Depends(browser_request)], response_model=Proposal)
def review_change(request: ProposalRequest):
    try:
        return review_proposal(request.project, request.proposal, datetime.now(ZoneInfo(request.project.settings.timezone)))
    except ValueError as exc:
        raise HTTPException(409, str(exc) if isinstance(exc, AssistantError) else "Invalid proposal. Check the dates and hours.") from exc


@app.post("/api/assistant/apply", dependencies=[Depends(browser_request)], response_model=Project)
def apply_change(request: ProposalRequest):
    try:
        return apply_proposal(request.project, request.proposal, datetime.now(ZoneInfo(request.project.settings.timezone)))
    except ValueError as exc:
        raise HTTPException(409, str(exc) if isinstance(exc, AssistantError) else "Invalid proposal. Check the dates and hours.") from exc


@app.post("/api/extract", dependencies=[Depends(browser_request)])
async def extract(
    file: Annotated[UploadFile, File()],
    project: Annotated[str, Form(max_length=2_000_000)],
    consent: Annotated[bool, Form()],
):
    if not consent:
        raise HTTPException(400, "Confirm that the document text may be sent to your configured AI provider.")
    try:
        current = Project.model_validate_json(project)
    except ValidationError as exc:
        raise HTTPException(422, "Project validation failed. Check your dates and study settings.") from exc
    ai = load_ai_config()
    data = await file.read(MAX_BYTES + 1)
    await file.close()
    if not extraction_lock.acquire(blocking=False):
        raise HTTPException(409, "Another extraction is running. Please wait before retrying.")
    try:
        document = await run_in_threadpool(read_document, file.filename or "upload.pdf", data)
        items, warnings = await run_in_threadpool(
            extract_document,
            document,
            current.settings,
            ai.api_key,
            ai.model,
            base_url=ai.base_url,
            provider_label=ai.label,
        )
        assessments, conflicts = merge_assessments(current.assessments, items)
        current.assessments = assessments
        # Revalidate the whole aggregate, including timezone-sensitive dates.
        current = Project.model_validate(current.model_dump())
        return {"project": current, "warnings": warnings + conflicts, "extracted": len(items)}
    except ValidationError as exc:
        raise HTTPException(
            422,
            "Extracted data failed semester validation. No entries from this file were imported; try a shorter section or manual entry.",
        ) from exc
    finally:
        extraction_lock.release()


@app.post("/api/exports/{kind}", dependencies=[Depends(browser_request)])
def export(kind: str, project: Project):
    if kind == "csv":
        data, mime, extension = csv_export(project), "text/csv; charset=utf-8", "csv"
    elif kind == "ics":
        if any(not item.reviewed for item in project.assessments):
            raise HTTPException(400, "Review every assessment before exporting a calendar.")
        data = calendar_export(project, build_plan(project, datetime.now(ZoneInfo(project.settings.timezone))))
        mime, extension = "text/calendar; charset=utf-8", "ics"
    else:
        raise HTTPException(404, "Unknown export format")
    return Response(
        data, media_type=mime, headers={"Content-Disposition": f'attachment; filename="crunch-week.{extension}"'}
    )


class CreateNotionRequest(Model):
    project: Project
    parent_page: str = Field(default="", max_length=500)


class ConnectNotionRequest(Model):
    database: str = Field(min_length=1, max_length=500)


@app.post("/api/notion/create", dependencies=[Depends(browser_request)])
def create_notion(request: CreateNotionRequest):
    if not notion_lock.acquire(blocking=False):
        raise HTTPException(409, "A Notion operation is already running.")
    try:
        with NotionClient(os.getenv("NOTION_TOKEN", "")) as client:
            target = client.create_database(
                request.parent_page or os.getenv("NOTION_PARENT_PAGE_ID", ""), request.project
            )
            return target
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    finally:
        notion_lock.release()


@app.post("/api/notion/connect", dependencies=[Depends(browser_request)])
def connect_notion(request: ConnectNotionRequest):
    try:
        with NotionClient(os.getenv("NOTION_TOKEN", "")) as client:
            return client.resolve(request.database)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.post("/api/notion/sync", dependencies=[Depends(browser_request)])
def sync_notion(project: Project):
    if not notion_lock.acquire(blocking=False):
        raise HTTPException(409, "A Notion operation is already running.")
    try:
        with NotionClient(os.getenv("NOTION_TOKEN", "")) as client:
            return asdict(client.sync(project, build_plan(project, datetime.now(ZoneInfo(project.settings.timezone)))))
    finally:
        notion_lock.release()


@app.get("/api/samples/{code}")
def sample(code: str):
    if code not in {"CS401", "PS402", "BS403"}:
        raise HTTPException(404, "Unknown sample")
    return FileResponse(
        ROOT / "sample_data" / f"{code}_synthetic_demo.pdf",
        media_type="application/pdf",
        filename=f"{code}_synthetic_demo.pdf",
    )


# Vite's built assets are served from the same origin as the API in production.
dist = ROOT / "frontend" / "dist"
if dist.is_dir():
    app.mount("/", StaticFiles(directory=dist, html=True), name="frontend")
