import csv
import io
import json
from datetime import date

import pytest
from fastapi.testclient import TestClient
from icalendar import Calendar

from crunch_week.api import app
from crunch_week.exports import calendar_export, csv_export, safe_cell
from crunch_week.models import Assessment
from crunch_week.planner import build_plan


@pytest.fixture
def client(monkeypatch):
    for key in [
        "AI_PROVIDER",
        "AZURE_OPENAI_API_KEY",
        "AZURE_OPENAI_ENDPOINT",
        "AZURE_OPENAI_DEPLOYMENT",
        "OPENAI_API_KEY",
        "OPENAI_MODEL",
        "NOTION_TOKEN",
        "NOTION_PARENT_PAGE_ID",
    ]:
        monkeypatch.delenv(key, raising=False)
    return TestClient(app, base_url="http://localhost", headers={"X-Crunch-Week": "1"})


def test_calendar_roundtrip_uses_all_day_or_utc(project):
    project.assessments.append(
        Assessment(
            module="B", title="Essay; commas,\nand lines", due_date=date(2026, 10, 10), effort_minutes=0, reviewed=True
        )
    )
    plan = build_plan(project)
    data = calendar_export(project, plan)
    events = Calendar.from_ical(data).walk("VEVENT")
    assert len(events) == 2 + len(plan.blocks)
    assert len({str(event["UID"]) for event in events}) == len(events)
    assert events[0].decoded("DTSTART").hour == 16  # Dublin October is UTC+1.
    assert events[1].decoded("DTSTART") == date(2026, 10, 10)
    assert events[1].decoded("DTEND") == date(2026, 10, 11)


@pytest.mark.parametrize("value", ["=WEBSERVICE('x')", "+SUM(A1)", "  @evil", "-1+1", "\t=formula"])
def test_csv_formula_injection_neutralized(value):
    assert safe_cell(value).startswith("'")


def test_csv_roundtrip(project):
    project.assessments[0].title = '=HYPERLINK("https://evil.example")'
    rows = list(csv.DictReader(io.StringIO(csv_export(project).decode("utf-8-sig"))))
    assert rows[0]["Assessment"].startswith("'=")
    assert rows[0]["Weight (%)"] == "40.0"


def test_demo_plan_and_backup_roundtrip(client):
    demo = client.get("/api/demo").json()
    assert demo["demo"] and len(demo["assessments"]) == 9
    response = client.post("/api/plan", json=demo)
    assert response.status_code == 200
    assert any(week["Pressure"] == "Crunch" for week in response.json()["weeks"])
    assert client.post("/api/project/validate", json=demo).json() == demo
    assert client.post("/api/exports/ics", json=demo).headers["content-type"].startswith("text/calendar")


def test_validation_errors_do_not_echo_private_input(client):
    data = client.get("/api/project/new").json()
    data["private_secret"] = "DO_NOT_ECHO"
    response = client.post("/api/plan", json=data)
    assert response.status_code == 422
    assert "DO_NOT_ECHO" not in response.text


def test_csrf_and_untrusted_host_rejected():
    client = TestClient(app, base_url="http://localhost")
    assert client.post("/api/plan", json={}).status_code == 403
    assert client.get("/api/config", headers={"host": "evil.example"}).status_code == 400
    result = client.options(
        "/api/plan",
        headers={
            "Origin": "https://evil.example",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "X-Crunch-Week",
        },
    )
    assert result.status_code == 400


def test_oversized_request_blocked(client):
    assert client.post("/api/plan", content=b"x" * (27 * 1024 * 1024 + 1)).status_code == 413


def test_no_secrets_or_silent_live_calls(client):
    config = client.get("/api/config").json()
    assert not config["openai_configured"] and not config["notion_configured"]
    assert not config["ai_configured"]
    assert "api_key" not in config
    project = client.get("/api/project/new").json()
    response = client.post(
        "/api/extract", files={"file": ("x.txt", b"Hello")}, data={"project": json.dumps(project), "consent": "true"}
    )
    assert response.status_code == 400 and "OPENAI_API_KEY" in response.json()["detail"]


def test_extraction_requires_consent(client):
    project = client.get("/api/project/new").json()
    response = client.post(
        "/api/extract", files={"file": ("x.txt", b"Hello")}, data={"project": json.dumps(project), "consent": "false"}
    )
    assert response.status_code == 400 and "Confirm" in response.text


def test_unreviewed_calendar_export_rejected(client, project):
    project.assessments[0].reviewed = False
    response = client.post("/api/exports/ics", json=project.model_dump(mode="json"))
    assert response.status_code == 400


def test_upload_api_complete_flow_with_mocked_extractor(client, monkeypatch, project):
    from crunch_week.models import Assessment

    monkeypatch.setenv("OPENAI_API_KEY", "test-key-never-sent")

    def extract(document, settings, key, model, **kwargs):
        assert document.pages == ("Essay due next month",)
        assert kwargs["base_url"] == "https://api.openai.com/v1/"
        return [Assessment(module="PS402", title="Essay", notes="Confirm date.")], ["Deadline needs confirmation"]

    monkeypatch.setattr("crunch_week.api.extract_document", extract)
    response = client.post(
        "/api/extract",
        files={"file": ("outline.txt", b"Essay due next month")},
        data={"project": project.model_dump_json(), "consent": "true"},
    )
    assert response.status_code == 200
    assert len(response.json()["project"]["assessments"]) == 2
    assert response.json()["project"]["assessments"][1]["reviewed"] is False
    assert response.json()["warnings"] == ["Deadline needs confirmation"]


def test_extract_lock_rejects_concurrent_calls(client, monkeypatch, project):
    from crunch_week.api import extraction_lock

    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    assert extraction_lock.acquire(blocking=False)
    try:
        response = client.post(
            "/api/extract",
            files={"file": ("outline.txt", b"x")},
            data={"project": project.model_dump_json(), "consent": "true"},
        )
        assert response.status_code == 409
    finally:
        extraction_lock.release()


def test_azure_config_and_upload_use_only_azure(client, monkeypatch, project):
    monkeypatch.setenv("AI_PROVIDER", "azure")
    monkeypatch.setenv("AZURE_OPENAI_API_KEY", "private-azure-test-key")
    monkeypatch.setenv("OPENAI_API_KEY", "private-public-test-key")
    monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "https://example.services.ai.azure.com/")
    monkeypatch.setenv("AZURE_OPENAI_DEPLOYMENT", "handbook-reader")
    result = client.get("/api/config")
    assert result.json()["ai_configured"]
    assert result.json()["ai_provider_name"] == "Azure AI Foundry"
    assert not result.json()["openai_configured"]
    assert "private-" not in result.text

    def extract(document, settings, key, model, **kwargs):
        assert key == "private-azure-test-key"
        assert model == "handbook-reader"
        assert kwargs["base_url"] == "https://example.services.ai.azure.com/openai/v1/"
        assert kwargs["provider_label"] == "Azure AI Foundry"
        return [], []

    monkeypatch.setattr("crunch_week.api.extract_document", extract)
    response = client.post(
        "/api/extract",
        files={"file": ("outline.txt", b"No assessments")},
        data={"project": project.model_dump_json(), "consent": "true"},
    )
    assert response.status_code == 200


def test_missing_azure_configuration_never_falls_back(client, monkeypatch, project):
    monkeypatch.setenv("AI_PROVIDER", "azure")
    monkeypatch.setenv("OPENAI_API_KEY", "private-public-test-key")
    config = client.get("/api/config").json()
    assert not config["ai_configured"]
    assert "AZURE_OPENAI_DEPLOYMENT" in config["ai_error"]
    response = client.post(
        "/api/extract",
        files={"file": ("outline.txt", b"No assessments")},
        data={"project": project.model_dump_json(), "consent": "true"},
    )
    assert response.status_code == 400
    assert "AZURE_OPENAI_API_KEY" in response.json()["detail"]
    assert "private-public-test-key" not in response.text
