import json
from uuid import uuid4

import httpx
import pytest

from crunch_week.models import NotionTarget
from crunch_week.notion import API_VERSION, SCHEMA, NotionClient, NotionError, notion_id, plain_text
from crunch_week.planner import build_plan


class FakeNotion:
    """Stateful HTTP fixture: exercises actual adapter URLs, payloads and re-sync behavior."""

    def __init__(self):
        self.database = str(uuid4())
        self.source = str(uuid4())
        self.pages = {}
        self.views = []
        self.calls = []
        self.fail_create_at = None
        self.creates = 0

    def __call__(self, request):
        assert request.headers["notion-version"] == API_VERSION
        body = json.loads(request.content) if request.content else {}
        path = request.url.path.removeprefix("/v1/")
        self.calls.append((request.method, path, body))
        if request.method == "GET" and path.startswith("databases/"):
            data = {"id": self.database, "data_sources": [{"id": self.source}]}
        elif request.method == "GET" and path.startswith("data_sources/"):
            data = {
                "id": self.source,
                "properties": {
                    name: {"type": next(iter(schema)), "id": f"prop-{i}"}
                    for i, (name, schema) in enumerate(SCHEMA.items())
                },
            }
        elif path.endswith("/query"):
            assert body["filter"]["property"] == "Crunch key"
            data = {"results": list(self.pages.values()), "has_more": False}
        elif path == "pages" and request.method == "POST":
            self.creates += 1
            if self.creates == self.fail_create_at:
                return httpx.Response(503, json={"message": "unavailable"})
            assert body["parent"] == {"type": "data_source_id", "data_source_id": self.source}
            page_id = str(uuid4())
            data = {"id": page_id, "properties": body["properties"]}
            self.pages[page_id] = data
        elif path.startswith("pages/") and request.method == "PATCH":
            page = self.pages[path.split("/")[1]]
            page["properties"].update(body["properties"])
            data = page
        elif path == "views" and request.method == "GET":
            assert request.url.params["database_id"] == self.database
            data = {"results": self.views, "has_more": False}
        elif path == "views" and request.method == "POST":
            if body["type"] == "calendar":
                assert body["configuration"]["date_property_id"] == "prop-1"
            data = {"id": str(uuid4()), **body}
            self.views.append(data)
        else:
            raise AssertionError(f"Unexpected endpoint: {request.method} {path}")
        return httpx.Response(200, json=data)


def client_for(fake):
    return NotionClient("test-token", transport=httpx.MockTransport(fake), sleep=lambda _: None)


def attach(project, fake):
    project.notion = NotionTarget(database_id=fake.database, data_source_id=fake.source)


def test_repeat_sync_preserves_done_without_duplicates(project):
    fake = FakeNotion()
    attach(project, fake)
    plan = build_plan(project)
    with client_for(fake) as client:
        first = client.sync(project, plan)
        assert first.created == 1 + len(plan.blocks)
        assert len(fake.views) == 3
        first_page = next(iter(fake.pages.values()))
        first_page["properties"]["Done"] = {"checkbox": True}
        second = client.sync(project, plan)
        assert second.created == 0 and second.updated == first.created
        assert len(fake.pages) == first.created
        assert first_page["properties"]["Done"]["checkbox"] is True
        assert len(fake.views) == 3


def test_changed_plan_supersedes_stale_rows_without_deleting(project):
    fake = FakeNotion()
    attach(project, fake)
    with client_for(fake) as client:
        first = client.sync(project, build_plan(project))
        project.assessments[0].effort_minutes = 0
        second = client.sync(project, build_plan(project))
        assert second.superseded == first.created - 1
        assert len(fake.pages) == first.created


def test_partial_failure_recovers_without_duplicate_creates(project):
    fake = FakeNotion()
    fake.fail_create_at = 2
    attach(project, fake)
    with client_for(fake) as client:
        partial = client.sync(project, build_plan(project))
        assert partial.error and partial.created == 1 and not partial.superseded
        assert fake.creates == 2  # Non-idempotent writes are never blindly retried on 503.
        fake.fail_create_at = None
        resumed = client.sync(project, build_plan(project))
        assert resumed.error is None
        assert resumed.updated == 1
        assert len(fake.pages) == 1 + len(build_plan(project).blocks)


def test_foreign_keys_are_never_touched(project):
    fake = FakeNotion()
    attach(project, fake)
    foreign = {"id": str(uuid4()), "properties": {"Crunch key": {"rich_text": [{"plain_text": "someone-elses-row"}]}}}
    fake.pages[foreign["id"]] = foreign
    with client_for(fake) as client:
        assert client.sync(project, build_plan(project)).error is None
    assert fake.pages[foreign["id"]] == foreign
    assert "Lifecycle" not in foreign["properties"]


def test_duplicate_keys_stop_before_writing(project):
    fake = FakeNotion()
    attach(project, fake)
    with client_for(fake) as client:
        client.sync(project, build_plan(project))
        duplicate = dict(next(iter(fake.pages.values())))
        duplicate["id"] = str(uuid4())
        fake.pages[duplicate["id"]] = duplicate
        before = len(fake.calls)
        with pytest.raises(NotionError, match="Duplicate"):
            client.sync(project, build_plan(project))
        assert not any(method == "PATCH" or path == "pages" for method, path, _ in fake.calls[before:])


def test_rate_limit_honors_retry_after():
    calls, delays = [], []

    def handler(request):
        calls.append(request)
        return (
            httpx.Response(429, headers={"Retry-After": "3"})
            if len(calls) == 1
            else httpx.Response(200, json={"ok": True})
        )

    with NotionClient("token", transport=httpx.MockTransport(handler), sleep=delays.append) as client:
        assert client.request("GET", "users/me", safe_retry=True) == {"ok": True}
    assert 3 in delays and len(calls) == 2


def test_incomplete_listing_stops_sync():
    def handler(request):
        return httpx.Response(200, json={"results": [], "has_more": False, "request_status": {"type": "incomplete"}})

    with client_for(handler) as client, pytest.raises(NotionError, match="incomplete listing"):
        client.list_all("views")


def test_pagination_reads_all_results():
    calls = []

    def handler(request):
        calls.append(request)
        if len(calls) == 1:
            return httpx.Response(200, json={"results": [{"id": "1"}], "has_more": True, "next_cursor": "next"})
        assert request.url.params["start_cursor"] == "next"
        return httpx.Response(200, json={"results": [{"id": "2"}], "has_more": False})

    with client_for(handler) as client:
        assert len(client.list_all("views", params={"database_id": "db"})) == 2


def test_create_database_recovers_existing_child(project):
    database, source, parent = str(uuid4()), str(uuid4()), str(uuid4())
    calls = []

    def handler(request):
        calls.append(request)
        if request.url.path.endswith("children"):
            return httpx.Response(
                200,
                json={
                    "results": [
                        {
                            "id": database,
                            "type": "child_database",
                            "child_database": {"title": f"Crunch Week · {project.id}"},
                        }
                    ],
                    "has_more": False,
                },
            )
        if "/databases/" in request.url.path:
            return httpx.Response(200, json={"id": database, "data_sources": [{"id": source}]})
        return httpx.Response(
            200, json={"properties": {name: {"type": next(iter(schema))} for name, schema in SCHEMA.items()}}
        )

    with client_for(handler) as client:
        assert str(client.create_database(parent, project).database_id) == database
    assert all(call.method == "GET" for call in calls)


def test_create_database_uses_current_data_source_schema(project):
    parent, database, source = str(uuid4()), str(uuid4()), str(uuid4())

    def handler(request):
        if request.method == "GET":
            return httpx.Response(200, json={"results": [], "has_more": False})
        data = json.loads(request.content)
        assert data["parent"] == {"type": "page_id", "page_id": parent}
        assert data["initial_data_source"]["properties"] == SCHEMA
        return httpx.Response(200, json={"id": database, "data_sources": [{"id": source}]})

    with client_for(handler) as client:
        assert str(client.create_database(parent, project).data_source_id) == source


@pytest.mark.parametrize("url", ["https://evil.example/" + "a" * 32, "../v1/users", "not-an-id"])
def test_ids_cannot_be_arbitrary_urls_or_paths(url):
    with pytest.raises(ValueError):
        notion_id(url)


def test_notion_url_ignores_view_query():
    identifier = uuid4()
    assert notion_id(f"https://www.notion.so/My-page-{identifier.hex}?v={uuid4().hex}") == str(identifier)
    assert plain_text({"rich_text": [{"text": {"content": "hello"}}]}) == "hello"
