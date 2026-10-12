import io
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from test_assistant_estimates import CONFIG, NOW, draft
from test_documents_extraction import _office_zip, pdf_bytes, raw_item

import crunch_week.api as api
from crunch_week.app_help import HELP, OUT_OF_SCOPE, local_help
from crunch_week.assistant import ChatMessage, Interpretation, build_proposal, interpret
from crunch_week.chat_usage import DailyChatBudget, DailyLimitError
from crunch_week.documents import Document, DocumentError, chunks, read_document, reference_context
from crunch_week.extraction import ExtractionResult, convert_item, extract_document


def test_daily_budget_blocks_26th_and_survives_new_instance(tmp_path):
    path = tmp_path / "usage.sqlite3"
    budget = DailyChatBudget(path)
    for i in range(25):
        assert budget.reserve(NOW).remaining == 24 - i
    reloaded = DailyChatBudget(path)
    assert reloaded.status(NOW).used == 25
    with pytest.raises(DailyLimitError):
        reloaded.reserve(NOW)
    assert reloaded.status(NOW + timedelta(days=1)).remaining == 25
    assert reloaded.reserve(NOW + timedelta(days=1)).used == 1


def test_daily_budget_is_atomic_across_threads(tmp_path):
    path = tmp_path / "usage.sqlite3"

    def send(_):
        try:
            DailyChatBudget(path).reserve(NOW)
            return True
        except DailyLimitError:
            return False

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(send, range(40)))
    assert sum(results) == 25
    assert DailyChatBudget(path).status(NOW).remaining == 0


def test_reset_uses_dublin_calendar_day_across_dst(tmp_path):
    budget = DailyChatBudget(tmp_path / "usage.sqlite3")
    before = datetime(2026, 10, 24, 23, 30, tzinfo=timezone.utc)  # 00:30 Dublin on the 25th
    first = budget.reserve(before)
    assert first.reset_at.isoformat() == "2026-10-26T00:00:00+00:00"
    assert budget.status(datetime(2026, 10, 25, 23, 59, tzinfo=timezone.utc)).used == 1
    assert budget.status(datetime(2026, 10, 26, 0, 0, tzinfo=timezone.utc)).used == 0


@pytest.mark.parametrize(
    "question,topic",
    [
        ("Where do I set my free hours?", "availability"),
        ("How do I upload a document?", "upload"),
        ("Where is the focus timer?", "focus"),
        ("How do I undo a session?", "progress"),
        ("What is the chat limit?", "limits"),
    ],
)
def test_local_help_topics(question, topic):
    assert local_help(question) == (topic, HELP[topic])


@pytest.mark.parametrize(
    "text",
    [
        "Add a Friday work shift 17:00 to 21:00",
        "How do I write my report?",
        "What's my actual deadline?",
        "How is the weather?",
    ],
)
def test_local_help_does_not_intercept_changes_or_coursework(text):
    assert local_help(text) is None


@pytest.mark.parametrize("intent", ["help", "out_of_scope"])
def test_help_and_off_topic_model_outputs_cannot_apply_changes(project, intent):
    value = draft(project)
    value.intent = intent
    value.help_topic = "upload"
    value.message = "Fake general answer"
    preview = build_proposal(project, value, NOW)
    assert not preview.commitment_changes and not preview.effort_changes and not preview.questions
    assert preview.message == (HELP["upload"] if intent == "help" else OUT_OF_SCOPE)
    assert preview.before == preview.after


def test_api_enforces_25_before_any_provider_request_and_counts_failures(monkeypatch, project):
    client = TestClient(api.app, base_url="http://localhost", headers={"X-Crunch-Week": "1"})
    calls = []
    monkeypatch.setattr(api, "load_chat_config", lambda: CONFIG)

    def mocked(*_):
        calls.append(1)
        return draft(project)

    monkeypatch.setattr(api, "interpret", mocked)
    body = {
        "project": project.model_dump(mode="json"),
        "messages": [{"role": "user", "content": "Add work Friday 17 to 21"}],
        "consent": True,
    }
    for _ in range(25):
        assert client.post("/api/assistant/propose", json=body).status_code == 200
    body["project"]["id"] = "00000000-0000-0000-0000-000000000001"
    assert client.post("/api/assistant/propose", json=body).status_code == 429
    assert len(calls) == 25
    assert client.get("/api/assistant/usage").json()["remaining"] == 0


def test_local_help_works_without_consent_or_ai_and_uses_allowance(monkeypatch, project):
    def forbidden(*_):
        raise AssertionError("An AI call is unnecessary")

    monkeypatch.setattr(api, "load_chat_config", forbidden)
    monkeypatch.setattr(api, "interpret", forbidden)
    client = TestClient(api.app, base_url="http://localhost", headers={"X-Crunch-Week": "1"})
    body = {
        "project": project.model_dump(mode="json"),
        "messages": [{"role": "user", "content": "Where do I set my free hours?"}],
        "consent": False,
    }
    response = client.post("/api/assistant/propose", json=body)
    assert response.status_code == 200
    assert response.json()["message"] == HELP["availability"]
    assert response.json()["usage"]["remaining"] == 24
    assert response.json()["commitment_changes"] == []


def test_sdk_chat_has_no_automatic_retries_and_scope_schema(monkeypatch, project):
    client = MagicMock()
    client.__enter__.return_value = client
    client.responses.parse.return_value = SimpleNamespace(status="completed", output_parsed=draft(project))
    factory = MagicMock(return_value=client)
    monkeypatch.setattr("crunch_week.assistant.OpenAI", factory)
    interpret(project, [ChatMessage(role="user", content="Change my shift")], CONFIG, NOW)
    assert factory.call_args.kwargs["max_retries"] == 0
    args = client.responses.parse.call_args.kwargs
    assert args["max_output_tokens"] == 2500
    assert (
        "out_of_scope" in Interpretation.model_json_schema()["required"]
        or "intent" in Interpretation.model_json_schema()["required"]
    )
    assert "App guide" in args["instructions"]


def test_pdf_table_keeps_column_values_in_rows():
    stream = io.BytesIO()
    page = canvas.Canvas(stream)
    for y, values in [
        (750, ["Assessment", "Weight", "Deadline"]),
        (730, ["Research report", "40%", "2026-11-02"]),
        (710, ["Exam", "60%", "2026-12-04"]),
    ]:
        for x, value in zip([50, 260, 380], values, strict=True):
            page.drawString(x, y, value)
    page.save()
    document = read_document("table.pdf", stream.getvalue())
    assert any(
        "Research report" in line and "40%" in line and "2026-11-02" in line for line in document.pages[0].splitlines()
    )
    assert any("Exam" in line and "60%" in line and "2026-12-04" in line for line in document.pages[0].splitlines())


def test_blank_pdf_pages_preserve_physical_source_numbering():
    writer = PdfWriter()
    writer.add_page(PdfReader(io.BytesIO(pdf_bytes("First page"))).pages[0])
    writer.add_blank_page(600, 800)
    writer.add_page(PdfReader(io.BytesIO(pdf_bytes("Report due 2026-11-02"))).pages[0])
    output = io.BytesIO()
    writer.write(output)
    document = read_document("blank.pdf", output.getvalue())
    assert len(document.pages) == 3 and not document.pages[1].strip()
    assert "[PAGE 3]" in document.text and document.warnings


def test_chunk_boundaries_preserve_rows_and_preceding_context():
    rows = [f"Report {i:03d} | 20% | 2026-11-02\n" for i in range(150)]
    document = Document("outline.txt", "digest", ("Module CS401\n" + "".join(rows),))
    pieces = chunks(document, size=1500, overlap=200)
    assert all(len(piece) <= 1500 for piece in pieces)
    assert all(any(row.strip() in piece for piece in pieces) for row in rows)
    assert "Module CS401" in reference_context(document, pieces[-1])
    assert len(set(pieces[0].splitlines()) & set(pieces[1].splitlines())) > 1


def test_zip_read_failures_are_visible_and_large_page_indices_supported():
    document = read_document("modules.zip", _office_zip({"good.txt": "Report due 2026-11-02", "bad.pdf": "bad"}))
    assert any("bad.pdf" in warning for warning in document.warnings)
    long = Document("many.zip", "digest", tuple(["Different text"] * 50 + [raw_item().evidence]))
    item = convert_item(raw_item(source_page=51), long)
    assert item.source_page == 51 and item.due_date is not None


def test_evidence_matching_repairs_page_and_pdf_ligatures():
    document = Document(
        "x.pdf", "digest", ("Unrelated", "Assessment office submis-\nsion due 2026-10-09 weighting 40%.")
    )
    item = convert_item(raw_item(evidence="Assessment ofﬁce submission due 2026-10-09 weighting 40%."), document)
    assert item.source_page == 2 and item.due_date is not None
    assert "Source page corrected" in item.notes


def test_ambiguous_evidence_clears_unverified_fields_and_bad_time_keeps_date():
    document = Document("x.txt", "digest", (raw_item().evidence, raw_item().evidence))
    item = convert_item(raw_item(source_page=99), document)
    assert item.due_date is None and item.due_time is None and item.weight_percent is None
    valid = convert_item(raw_item(due_time="25:00"), document)
    assert str(valid.due_date) == "2026-10-09" and valid.due_time is None


def test_zip_warnings_and_header_context_reach_extraction_without_extra_calls(monkeypatch, project):
    calls = []
    client = MagicMock()
    client.__enter__.return_value = client
    client.responses.parse.side_effect = lambda **kw: (
        calls.append(kw)
        or SimpleNamespace(status="completed", output_parsed=ExtractionResult(assessments=[raw_item()], warnings=[]))
    )
    monkeypatch.setattr("crunch_week.extraction.OpenAI", MagicMock(return_value=client))
    document = Document(
        "outline.txt", "d", ("Module CS401\n" + raw_item().evidence,), ("Skipped unreadable ZIP file: broken.pdf",)
    )
    _, warnings = extract_document(document, project.settings, "test-key")
    assert len(calls) == 1 and "REFERENCE CONTEXT" in calls[0]["input"]
    assert "broken.pdf" in warnings[0]


def test_provider_failures_use_allowance_but_storage_failure_calls_no_provider(monkeypatch, project):
    from crunch_week.assistant import AssistantError

    client = TestClient(api.app, base_url="http://localhost", headers={"X-Crunch-Week": "1"})
    monkeypatch.setattr(api, "load_chat_config", lambda: CONFIG)
    calls = []

    def failure(*_):
        calls.append(1)
        raise AssistantError("Provider timed out")

    monkeypatch.setattr(api, "interpret", failure)
    body = {
        "project": project.model_dump(mode="json"),
        "messages": [{"role": "user", "content": "Add work Friday 17 to 21"}],
        "consent": True,
    }
    assert client.post("/api/assistant/propose", json=body).status_code == 400
    assert client.get("/api/assistant/usage").json()["used"] == 1

    def broken(_):
        raise OSError("Private filesystem error")

    monkeypatch.setattr(api.chat_budget, "reserve", broken)
    response = client.post("/api/assistant/propose", json=body)
    assert response.status_code == 503 and "Private" not in response.text and len(calls) == 1


def test_nontext_vector_pdf_page_is_not_mistaken_for_blank():
    stream = io.BytesIO()
    page = canvas.Canvas(stream)
    page.drawString(50, 750, "Readable intro")
    page.showPage()
    page.rect(50, 50, 200, 200, fill=1)
    page.save()
    with pytest.raises(DocumentError, match="OCR"):
        read_document("outlines.pdf", stream.getvalue())


def test_zip_header_context_keeps_identically_named_files_separate():
    document = read_document(
        "modules.zip",
        _office_zip({"CS401/outline.txt": "Module CS401\nEssay", "MA402/outline.txt": "Module MA402\nExam"}),
    )
    assert "[FILE CS401/outline.txt]" in document.pages[0]
    context = reference_context(document, "[PAGE 2]\nExam")
    assert "MA402" in context and "CS401" not in context



def test_changed_chat_provider_requires_fresh_consent_without_spending_allowance(monkeypatch, project):
    monkeypatch.setattr(api, "load_chat_config", lambda: CONFIG)
    def forbidden(*_):
        raise AssertionError("A mismatched provider must not receive the message")
    monkeypatch.setattr(api, "interpret", forbidden)
    client = TestClient(api.app, base_url="http://localhost", headers={"X-Crunch-Week": "1"})
    initial = client.get("/api/assistant/usage").json()["remaining"]
    response = client.post("/api/assistant/propose", json={
        "project": project.model_dump(mode="json"), "consent": True, "expected_provider": "ollama",
        "messages": [{"role": "user", "content": "I have training every Tuesday 18:00 to 20:00"}],
    })
    assert response.status_code == 409
    assert "No message was sent" in response.json()["detail"]
    assert client.get("/api/assistant/usage").json()["remaining"] == initial
