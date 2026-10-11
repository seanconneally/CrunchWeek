"""Notion data-source and views API adapter with conservative write recovery."""

from __future__ import annotations

import re
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from urllib.parse import urlparse
from uuid import UUID

import httpx

from crunch_week.models import NotionTarget, Plan, Project, local_datetime
from crunch_week.planner import weekly_summary

API_VERSION = "2026-03-11"
SCHEMA = {
    "Name": {"title": {}},
    "When": {"date": {}},
    "Module": {"rich_text": {}},
    "Kind": {"select": {"options": [{"name": "Deadline"}, {"name": "Study"}]}},
    "Weight (%)": {"number": {"format": "number"}},
    "Effort (h)": {"number": {"format": "number"}},
    "Semester week": {"number": {"format": "number"}},
    "Pressure": {
        "select": {
            "options": [
                {"name": "Clear", "color": "gray"},
                {"name": "Steady", "color": "green"},
                {"name": "Busy", "color": "yellow"},
                {"name": "Crunch", "color": "red"},
            ]
        }
    },
    "Source": {"rich_text": {}},
    "Evidence": {"rich_text": {}},
    "Notes": {"rich_text": {}},
    "Crunch key": {"rich_text": {}},
    "Lifecycle": {
        "select": {"options": [{"name": "Active", "color": "green"}, {"name": "Superseded", "color": "gray"}]}
    },
    "Done": {"checkbox": {}},
}


class NotionError(RuntimeError):
    pass


def notion_id(value: str) -> str:
    value = value.strip()
    if value.startswith("https://"):
        parsed = urlparse(value)
        if parsed.hostname not in {"notion.so", "www.notion.so", "notion.com", "www.notion.com"}:
            raise ValueError("Use a notion.so / notion.com URL or a page UUID.")
        value = parsed.path.rstrip("/").rsplit("/", 1)[-1]
        match = re.search(r"([a-fA-F0-9]{32}|[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12})$", value)
        if not match:
            raise ValueError("The Notion URL does not contain a page ID.")
        value = match.group(1)
    try:
        return str(UUID(value))
    except ValueError as exc:
        raise ValueError("Enter a valid Notion page ID or full page URL.") from exc


def rich_text(value: str) -> list[dict]:
    return [
        {"type": "text", "text": {"content": value[index : index + 1900]}}
        for index in range(0, min(len(value), 5700), 1900)
    ]


def plain_text(value: dict, kind: str = "rich_text") -> str:
    return "".join(piece.get("plain_text", piece.get("text", {}).get("content", "")) for piece in value.get(kind, []))


@dataclass
class SyncResult:
    created: int = 0
    updated: int = 0
    superseded: int = 0
    warnings: list[str] = field(default_factory=list)
    error: str | None = None


class NotionClient:
    def __init__(
        self, token: str, *, transport: httpx.BaseTransport | None = None, sleep: Callable[[float], None] = time.sleep
    ):
        if not token.strip():
            raise NotionError("Set NOTION_TOKEN on the backend first.")
        self.client = httpx.Client(
            base_url="https://api.notion.com/v1/",
            timeout=30,
            transport=transport,
            follow_redirects=False,
            headers={"Authorization": f"Bearer {token.strip()}", "Notion-Version": API_VERSION},
        )
        self.sleep = sleep
        self.last_request = 0.0

    def __enter__(self) -> NotionClient:
        return self

    def __exit__(self, *args: object) -> None:
        self.client.close()

    def request(
        self,
        method: str,
        path: str,
        *,
        payload: dict | None = None,
        params: dict | None = None,
        safe_retry: bool = False,
    ) -> dict:
        for attempt in range(4):
            self.sleep(max(0, 0.36 - (time.monotonic() - self.last_request)))
            try:
                self.last_request = time.monotonic()
                response = self.client.request(method, path, json=payload, params=params)
            except httpx.TransportError as exc:
                if safe_retry and attempt < 3:
                    self.sleep(2**attempt)
                    continue
                raise NotionError(
                    "Notion connection interrupted. A write may have completed. Retry sync to reconcile; do not create a fresh project."
                ) from exc
            if response.status_code == 429:
                try:
                    delay = float(response.headers.get("Retry-After", "2"))
                except ValueError:
                    delay = 2
                if delay > 30 or attempt == 3:
                    raise NotionError("Notion is rate limiting requests. Wait and retry sync.")
                self.sleep(max(1, delay))
                continue
            if response.status_code >= 500 and safe_retry and attempt < 3:
                self.sleep(2**attempt)
                continue
            if response.is_error:
                hints = {
                    401: "The Notion token was rejected.",
                    403: "Grant the connection read, insert and update content capabilities.",
                    404: "Share the parent page/database with the Notion connection and check the ID.",
                    400: "Notion rejected the schema or values. Restore the original Crunch Week property names/types.",
                    409: "Notion reported a conflict. Wait and retry sync.",
                }
                raise NotionError(
                    hints.get(
                        response.status_code,
                        f"Notion returned HTTP {response.status_code}. Retry sync to reconcile any completed writes.",
                    )
                )
            try:
                return response.json()
            except ValueError as exc:
                raise NotionError("Notion returned an unreadable response. Retry sync to reconcile.") from exc
        raise NotionError("Notion request retries exhausted.")

    def list_all(self, path: str, *, payload: dict | None = None, params: dict | None = None) -> list[dict]:
        items = []
        cursor = None
        for _ in range(200):
            arguments = dict(payload if payload is not None else params or {})
            arguments["page_size"] = 100
            if cursor:
                arguments["start_cursor"] = cursor
            page = self.request(
                "POST" if payload is not None else "GET",
                path,
                payload=arguments if payload is not None else None,
                params=arguments if payload is None else None,
                safe_retry=True,
            )
            if page.get("request_status", {}).get("type") not in (None, "complete"):
                raise NotionError("Notion returned an incomplete listing. Retry before syncing any changes.")
            items.extend(page.get("results", []))
            if not page.get("has_more"):
                return items
            next_cursor = page.get("next_cursor")
            if not next_cursor or next_cursor == cursor:
                raise NotionError("Notion pagination did not advance. No sync changes were started.")
            cursor = next_cursor
        raise NotionError("This database is too large for this local demo.")

    def resolve(self, database_id: str) -> NotionTarget:
        database = self.request("GET", f"databases/{notion_id(database_id)}", safe_retry=True)
        sources = database.get("data_sources", [])
        for source in sources:
            metadata = self.request("GET", f"data_sources/{source['id']}", safe_retry=True)
            props = metadata.get("properties", {})
            if all(name in props and props[name].get("type") == next(iter(schema)) for name, schema in SCHEMA.items()):
                return NotionTarget(database_id=database["id"], data_source_id=source["id"])
        raise NotionError("This database is not a compatible Crunch Week database. Create one using this app.")

    def create_database(self, parent_page: str, project: Project) -> NotionTarget:
        parent = notion_id(parent_page)
        # Stable title allows recovery if a create response was lost or browser refreshed.
        title = f"Crunch Week · {project.id}"
        for child in self.list_all(f"blocks/{parent}/children"):
            if child.get("type") == "child_database" and child["child_database"].get("title") == title:
                return self.resolve(child["id"])
        created = self.request(
            "POST",
            "databases",
            payload={
                "parent": {"type": "page_id", "page_id": parent},
                "title": rich_text(title),
                "description": rich_text(
                    f"{project.name}. Created by Crunch Week. App-managed fields update on sync; Done is yours."
                ),
                "is_inline": True,
                "initial_data_source": {"properties": SCHEMA},
            },
        )
        sources = created.get("data_sources", [])
        if not sources:
            return self.resolve(created["id"])
        return NotionTarget(database_id=created["id"], data_source_id=sources[0]["id"])

    def ensure_views(self, target: NotionTarget) -> None:
        metadata = self.request("GET", f"data_sources/{target.data_source_id}", safe_retry=True)
        props = metadata.get("properties", {})
        if "When" not in props:
            raise NotionError("The database is missing its When date property.")
        views = self.list_all("views", params={"database_id": str(target.database_id)})
        existing = {view.get("name") for view in views}
        active = {"property": "Lifecycle", "select": {"equals": "Active"}}
        for name, kind in [("Semester calendar", None), ("Deadlines", "Deadline"), ("Study plan", "Study")]:
            if name in existing:
                continue
            filters = [active] + ([{"property": "Kind", "select": {"equals": kind}}] if kind else [])
            payload = {
                "database_id": str(target.database_id),
                "data_source_id": str(target.data_source_id),
                "name": name,
                "type": "calendar" if kind is None else "table",
                "filter": {"and": filters},
                "sorts": [{"property": "When", "direction": "ascending"}],
            }
            if kind is None:
                payload["configuration"] = {
                    "type": "calendar",
                    "date_property_id": props["When"]["id"],
                    "view_range": "month",
                    "show_weekends": True,
                }
            self.request("POST", "views", payload=payload)

    def sync(self, project: Project, plan: Plan) -> SyncResult:
        if not project.notion:
            raise NotionError("Create or connect a Crunch Week database first.")
        if any(not item.reviewed for item in project.assessments):
            raise NotionError("Review every assessment before syncing to Notion.")
        target = self.resolve(str(project.notion.database_id))
        if target.data_source_id != project.notion.data_source_id:
            raise NotionError("Data-source identity changed. Reconnect the database before syncing.")
        prefix = f"cw:{project.id}:"
        existing_pages = self.list_all(
            f"data_sources/{target.data_source_id}/query",
            payload={
                "filter": {"property": "Crunch key", "rich_text": {"starts_with": prefix}},
            },
        )
        existing: dict[str, dict] = {}
        for page in existing_pages:
            key = plain_text(page.get("properties", {}).get("Crunch key", {}))
            if not key.startswith(prefix):
                continue
            if key in existing:
                raise NotionError(
                    "Duplicate Crunch keys found in Notion. Keep one copy of each duplicated row before syncing."
                )
            existing[key] = page
        desired = notion_rows(project, plan)
        result = SyncResult()
        # A partial failure returns counts and skips cleanup; retry reconciles by key.
        try:
            for key, properties in desired.items():
                previous = existing.get(key)
                if previous:
                    self.request(
                        "PATCH", f"pages/{previous['id']}", payload={"properties": properties}, safe_retry=True
                    )
                    result.updated += 1
                else:
                    self.request(
                        "POST",
                        "pages",
                        payload={
                            "parent": {"type": "data_source_id", "data_source_id": str(target.data_source_id)},
                            "properties": {**properties, "Done": {"checkbox": False}},
                        },
                    )
                    result.created += 1
            for key, page in existing.items():
                if key not in desired:
                    lifecycle = page.get("properties", {}).get("Lifecycle", {}).get("select") or {}
                    if lifecycle.get("name") != "Superseded":
                        self.request(
                            "PATCH",
                            f"pages/{page['id']}",
                            payload={"properties": {"Lifecycle": {"select": {"name": "Superseded"}}}},
                            safe_retry=True,
                        )
                        result.superseded += 1
        except NotionError as exc:
            result.error = str(exc)
        if result.error is None:
            try:
                self.ensure_views(target)
            except NotionError as exc:
                result.warnings.append(f"Rows synced, but view setup needs a retry: {exc}")
        return result


def notion_rows(project: Project, plan: Plan) -> dict[str, dict]:
    rows = {}
    prefix = f"cw:{project.id}:"
    pressures = {week["Week"]: week["Pressure"] for week in weekly_summary(project)}

    def week_properties(day):
        week = (day - project.settings.semester_start).days // 7 + 1 if day else None
        in_semester = day is not None and project.settings.semester_start <= day <= project.settings.semester_end
        return {
            "Semester week": {"number": week if in_semester else None},
            "Pressure": {"select": {"name": pressures[week]} if in_semester else None},
        }

    for item in project.assessments:
        if not item.reviewed:
            continue
        key = f"{prefix}deadline:{item.id}"
        when = None
        if item.due_date:
            value = (
                local_datetime(item.due_date, item.due_time, project.settings.timezone).isoformat()
                if item.due_time
                else item.due_date.isoformat()
            )
            when = {"start": value}
        rows[key] = {
            **week_properties(item.due_date),
            "Name": {"title": rich_text(item.title)},
            "When": {"date": when},
            "Module": {"rich_text": rich_text(item.module)},
            "Kind": {"select": {"name": "Deadline"}},
            "Weight (%)": {"number": item.weight_percent},
            "Effort (h)": {"number": item.effort_minutes / 60},
            "Source": {"rich_text": rich_text(f"{item.source_file}, page {item.source_page or 'n/a'}")},
            "Evidence": {"rich_text": rich_text(item.evidence)},
            "Notes": {"rich_text": rich_text(item.notes)},
            "Crunch key": {"rich_text": rich_text(key)},
            "Lifecycle": {"select": {"name": "Active"}},
        }
    for block in plan.blocks:
        key = f"{prefix}study:{block.id}"
        rows[key] = {
            **week_properties(block.start.date()),
            "Name": {"title": rich_text(f"Study · {block.title}")},
            "When": {"date": {"start": block.start.isoformat(), "end": block.end.isoformat()}},
            "Module": {"rich_text": rich_text(block.module)},
            "Kind": {"select": {"name": "Study"}},
            "Weight (%)": {"number": None},
            "Effort (h)": {"number": block.minutes / 60},
            "Source": {"rich_text": rich_text("Crunch Week planner")},
            "Evidence": {"rich_text": []},
            "Notes": {"rich_text": rich_text(f"Suggested block for assessment {block.assessment_id}")},
            "Crunch key": {"rich_text": rich_text(key)},
            "Lifecycle": {"select": {"name": "Active"}},
        }
    return rows
