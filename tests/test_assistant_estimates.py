from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

import crunch_week.api as api
import crunch_week.assistant as assistant
from crunch_week.ai_config import AIConfig
from crunch_week.assistant import (
    AssistantError,
    ChatMessage,
    DraftCommitment,
    DraftEffort,
    Interpretation,
    apply_proposal,
    build_proposal,
    context,
    interpret,
    review_proposal,
    signature,
)
from crunch_week.estimates import check_in
from crunch_week.models import StudyActivity
from crunch_week.planner import build_plan
from crunch_week.progress import study_action

NOW = datetime(2026, 10, 5, 12, tzinfo=timezone.utc)
CONFIG = AIConfig("openai", "OpenAI", "test-only-key", "test-model", "https://api.openai.com/v1/")


def draft(project):
    return Interpretation(
        intent="schedule", help_topic=None,
        message="Review the shift and extra two hours.",
        questions=[],
        commitments=[
            DraftCommitment(
                existing_id=None,
                remove=False,
                title="Work",
                date="2026-10-06",
                weekday=None,
                start="17:00",
                end="19:00",
            )
        ],
        effort_changes=[DraftEffort(assessment_id=str(project.assessments[0].id), operation="add", minutes=120)],
    )


def done(project):
    block = build_plan(project, NOW).blocks[0]
    logged = study_action(project, "done", block.id, NOW)
    return logged, logged.study_history[-1]


def test_compound_preview_conserves_work_and_applies_only_after_confirmation(project):
    original = project.model_dump()
    preview = build_proposal(project, draft(project), NOW)
    assert project.model_dump() == original
    assert preview.before.remaining_minutes == 240
    assert preview.after.remaining_minutes == 360
    assert preview.after.next_week_available_minutes == preview.before.next_week_available_minutes - 120
    assert preview.after.scheduled_minutes + preview.after.unscheduled_minutes == 360
    result = apply_proposal(project, preview, NOW + timedelta(minutes=1))
    assert result.assessments[0].effort_minutes == 360
    assert result.assessments[0].reviewed and not result.assessments[0].completed
    assert result.assessments[0].due_date == project.assessments[0].due_date
    assert len(result.settings.commitments) == 1
    assert not result.study_history


def test_clarifications_are_atomic_and_cannot_apply(project):
    value = draft(project)
    value.questions = ["What hours do you mean by Friday evening?"]
    preview = build_proposal(project, value, NOW)
    assert not preview.commitment_changes and not preview.effort_changes
    assert preview.before == preview.after
    with pytest.raises(AssistantError, match="clarification"):
        apply_proposal(project, preview, NOW)


@pytest.mark.parametrize("change", ["effort", "deadline", "availability", "review", "history"])
def test_direct_planning_edits_invalidate_pending_chat(project, change):
    preview = build_proposal(project, draft(project), NOW)
    changed = project.model_copy(deep=True)
    if change == "effort":
        changed.assessments[0].effort_minutes += 30
    elif change == "deadline":
        changed.assessments[0].due_date += timedelta(days=1)
    elif change == "availability":
        changed.settings.daily_minutes += 30
    elif change == "review":
        changed.assessments[0].reviewed = False
    else:
        changed, _ = done(changed)
    with pytest.raises(AssistantError, match="priority"):
        apply_proposal(changed, preview, NOW)
    with pytest.raises(AssistantError):
        review_proposal(changed, preview, NOW)


def test_unrelated_notes_are_preserved_and_not_sent_to_ai(project):
    preview = build_proposal(project, draft(project), NOW)
    project.assessments[0].notes = "Private note"
    assert "Private note" not in str(context(project))
    result = apply_proposal(project, preview, NOW)
    assert result.assessments[0].notes == "Private note"
    assert signature(project) == preview.base_signature


def test_edited_proposal_requires_an_updated_preview(project):
    preview = build_proposal(project, draft(project), NOW)
    preview.effort_changes[0].after_minutes = 600
    with pytest.raises(AssistantError, match="Update its preview"):
        apply_proposal(project, preview, NOW)
    revised = review_proposal(project, preview, NOW + timedelta(minutes=1))
    assert revised.after.remaining_minutes == 600
    assert revised.after.scheduled_minutes + revised.after.unscheduled_minutes == 600
    assert apply_proposal(project, revised, NOW + timedelta(minutes=2)).assessments[0].effort_minutes == 600


@pytest.mark.parametrize("offset", [-1, 16])
def test_future_or_expired_preview_cannot_apply(project, offset):
    preview = build_proposal(project, draft(project), NOW)
    with pytest.raises(AssistantError, match="expired"):
        apply_proposal(project, preview, NOW + timedelta(minutes=offset))


@pytest.mark.parametrize("invalid", ["unknown", "negative", "fraction", "overnight", "duplicate", "semester"])
def test_invalid_ai_changes_are_rejected(project, invalid):
    value = draft(project)
    if invalid == "unknown":
        value.effort_changes[0].assessment_id = str(uuid4())
    elif invalid == "negative":
        value.effort_changes[0].minutes = -30
    elif invalid == "fraction":
        value.effort_changes[0].minutes = 31
    elif invalid == "overnight":
        value.commitments[0].end = "01:00"
    elif invalid == "duplicate":
        value.effort_changes *= 2
    else:
        value.commitments[0].date = "2027-01-01"
    with pytest.raises(ValueError):
        build_proposal(project, value, NOW)


def test_sdk_uses_structured_output_and_limited_context(monkeypatch, project):
    client = MagicMock()
    client.__enter__.return_value = client
    client.responses.parse.return_value = SimpleNamespace(status="completed", output_parsed=draft(project))
    factory = MagicMock(return_value=client)
    monkeypatch.setattr(assistant, "OpenAI", factory)
    project.assessments[0].notes = "Keep this private"
    messages = [
        ChatMessage(role="user", content="Work Friday evening"),
        ChatMessage(role="assistant", content="What hours?"),
        ChatMessage(role="user", content="17:00 to 21:00, and add two hours to AI project"),
    ]
    assert interpret(project, messages, CONFIG, NOW).effort_changes[0].minutes == 120
    arguments = client.responses.parse.call_args.kwargs
    assert arguments["text_format"] is Interpretation and arguments["store"] is False
    assert arguments["model"] == "test-model"
    assert "Keep this private" not in str(arguments)
    assert arguments["input"][1:] == [row.model_dump() for row in messages]
    assert "API" not in str(context(project))


@pytest.mark.parametrize("status, parsed", [("incomplete", True), ("completed", False)])
def test_ai_incomplete_or_refusal_never_changes_plan(monkeypatch, project, status, parsed):
    client = MagicMock()
    client.__enter__.return_value = client
    client.responses.parse.return_value = SimpleNamespace(
        status=status, output_parsed=draft(project) if parsed else None
    )
    monkeypatch.setattr(assistant, "OpenAI", MagicMock(return_value=client))
    before = project.model_dump()
    with pytest.raises(AssistantError):
        interpret(project, [ChatMessage(role="user", content="Change")], CONFIG, NOW)
    assert project.model_dump() == before


@pytest.mark.parametrize("status", ["on_track", "need_more_time", "finished"])
def test_check_in_explicitly_updates_remaining_and_is_undoable(project, status):
    logged, block = done(project)
    baseline = logged.assessments[0].effort_minutes
    revised = check_in(logged, block.assessment_id, block.id, status, baseline, baseline + 120)
    item = revised.assessments[0]
    expected = baseline if status == "on_track" else baseline + 120 if status == "need_more_time" else 0
    assert item.effort_minutes == expected and item.reviewed and not item.completed
    assert revised.study_history[0].minutes == block.minutes
    assert revised.study_history[0].feedback == status
    assert (
        sum(row.minutes for row in build_plan(revised, NOW).blocks)
        + sum(row.minutes for row in build_plan(revised, NOW).shortfalls)
        == expected
    )
    assert logged.study_history[0].feedback is None
    assert study_action(revised, "undo", str(block.id)) == project


def test_check_in_rejects_stale_manual_estimate_and_manual_edit_survives_undo(project):
    logged, block = done(project)
    revised = check_in(logged, block.assessment_id, block.id, "finished", 180, None)
    revised.assessments[0].effort_minutes = 90
    assert study_action(revised, "undo", str(block.id)).assessments[0].effort_minutes == 150
    with pytest.raises(ValueError, match="changed in the app"):
        check_in(logged, block.assessment_id, block.id, "need_more_time", 240, 300)


def test_repeated_older_submitted_and_invalid_check_ins_are_rejected(project):
    logged, block = done(project)
    revised = check_in(logged, block.assessment_id, block.id, "on_track", 180, None)
    with pytest.raises(ValueError, match="already"):
        check_in(revised, block.assessment_id, block.id, "finished", 180, None)
    later, _ = done(logged)
    with pytest.raises(ValueError, match="latest"):
        check_in(later, block.assessment_id, block.id, "finished", 120, None)
    logged.assessments[0].completed = True
    with pytest.raises(ValueError, match="submitted"):
        check_in(logged, block.assessment_id, block.id, "finished", 180, None)
    logged.assessments[0].completed = False
    with pytest.raises(ValueError):
        check_in(logged, block.assessment_id, block.id, "need_more_time", 180, 180)
    with pytest.raises(ValidationError):
        check_in(logged, block.assessment_id, block.id, "need_more_time", 180, 211)


def test_legacy_activity_defaults_and_invalid_feedback(project):
    logged, _ = done(project)
    data = logged.study_history[0].model_dump()
    for key in ("remaining_before", "feedback", "feedback_previous_remaining", "reported_remaining"):
        data.pop(key)
    assert StudyActivity.model_validate(data).feedback is None
    with pytest.raises(ValidationError):
        StudyActivity.model_validate(
            {**data, "feedback": "finished", "reported_remaining": 30, "feedback_previous_remaining": 180}
        )


def test_chat_api_consent_staleness_and_error_lock_release(monkeypatch, project):
    client = TestClient(api.app, base_url="http://localhost", headers={"X-Crunch-Week": "1"})
    monkeypatch.setattr(api, "load_chat_config", lambda: CONFIG)
    monkeypatch.setattr(api, "interpret", lambda *_: draft(project))
    body = {
        "project": project.model_dump(mode="json"),
        "messages": [{"role": "user", "content": "Change my week"}],
        "consent": False,
    }
    assert client.post("/api/assistant/propose", json=body).status_code == 400
    body["consent"] = True
    response = client.post("/api/assistant/propose", json=body)
    assert response.status_code == 200
    proposal = response.json()
    body["project"]["assessments"][0]["effort_minutes"] = 300
    assert (
        client.post("/api/assistant/apply", json={"project": body["project"], "proposal": proposal}).status_code == 409
    )
    api.assistant_lock.acquire()
    try:
        assert client.post("/api/assistant/propose", json=body).status_code == 409
    finally:
        api.assistant_lock.release()

    def fail(*_):
        raise AssistantError("Try again")

    monkeypatch.setattr(api, "interpret", fail)
    assert client.post("/api/assistant/propose", json=body).status_code == 400
    assert not api.assistant_lock.locked()


def test_check_in_api_and_bounds(project):
    logged, block = done(project)
    client = TestClient(api.app, base_url="http://localhost", headers={"X-Crunch-Week": "1"})
    body = {
        "project": logged.model_dump(mode="json"),
        "assessment_id": str(block.assessment_id),
        "activity_id": str(block.id),
        "status": "need_more_time",
        "expected_remaining": 180,
        "remaining_minutes": 300,
    }
    response = client.post("/api/estimates/check-in", json=body)
    assert response.status_code == 200 and response.json()["assessments"][0]["effort_minutes"] == 300
    body["remaining_minutes"] = 301
    assert client.post("/api/estimates/check-in", json=body).status_code == 422


def test_undo_older_feedback_keeps_later_reported_work(project):
    logged, first = done(project)
    reported = check_in(logged, first.assessment_id, first.id, "need_more_time", 180, 300)
    later, second = done(reported)
    latest = check_in(later, second.assessment_id, second.id, "need_more_time", 240, 300)
    undone = study_action(latest, "undo", str(first.id))
    assert undone.assessments[0].effort_minutes == 360
    assert len(undone.study_history) == 1
    assert undone.study_history[0].feedback == "need_more_time"
