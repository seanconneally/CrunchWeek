from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from icalendar import Calendar
from pydantic import ValidationError

from crunch_week.api import app
from crunch_week.exports import calendar_export
from crunch_week.models import Assessment, Project, StudyActivity
from crunch_week.planner import build_plan, weekly_summary
from crunch_week.progress import study_action


def total_work(plan):
    return sum(b.minutes for b in plan.blocks) + sum(s.minutes for s in plan.shortfalls)


def test_steady_plan_starts_early_and_spreads_work(project):
    plan = build_plan(project)
    assert plan == build_plan(project)
    assert plan.blocks[0].start.date() == project.settings.plan_from
    assert len({b.start.date() for b in plan.blocks}) == 4
    assert total_work(plan) == 240


@pytest.mark.parametrize("action", ["done", "skipped"])
def test_session_actions_conserve_work_and_never_reuse_logged_time(project, action):
    first = build_plan(project).blocks[0]
    updated = study_action(project, action, first.id)
    expected = 240 - (first.minutes if action == "done" else 0)
    assert updated.assessments[0].effort_minutes == expected
    assert project.assessments[0].effort_minutes == 240  # no in-place mutation
    replanned = build_plan(updated)
    assert total_work(replanned) == expected
    assert all(b.end <= first.start or b.start >= first.end for b in replanned.blocks)
    assert updated.study_history[0].state == action
    with pytest.raises(ValueError, match="changed"):
        study_action(updated, action, first.id)
    undone = study_action(updated, "undo", first.id)
    assert undone == project
    assert build_plan(undone) == build_plan(project)


def test_long_run_keeps_capacity_conservation_with_completed_history(project):
    initial = project.assessments[0].effort_minutes
    while build_plan(project).blocks:
        first = build_plan(project).blocks[0]
        project = study_action(project, "done", first.id)
        assert project.assessments[0].effort_minutes + sum(r.minutes for r in project.study_history) == initial
    assert project.assessments[0].effort_minutes == 0
    assert sum(r.minutes for r in project.study_history) == initial
    assert not build_plan(project).shortfalls


def test_capacity_warning_uses_hours_instead_of_deadline_count(project):
    project.assessments = [Assessment(module="CS", title="Big project", due_date=date(2026,10,9), effort_minutes=1200, reviewed=True)]
    assert weekly_summary(project)[0]["Pressure"] == "Crunch"  # one heavy deadline
    project.assessments = [Assessment(module="CS", title=f"Quiz {i}", due_date=date(2026,10,9), effort_minutes=30, reviewed=True) for i in range(5)]
    summary = weekly_summary(project)[0]
    assert summary["Pressure"] == "Steady"  # five small deadlines
    assert summary["Capacity (h)"] == 15
    project.settings.days_off = [date(2026,10,5) + timedelta(days=i) for i in range(5)]
    assert weekly_summary(project)[0]["Pressure"] == "Crunch"


def test_submitted_work_is_excluded_from_planning_pressure_and_calendar(project):
    project.assessments[0].completed = True
    assert not build_plan(project).blocks
    assert not build_plan(project).shortfalls
    assert weekly_summary(project)[0]["Deadlines"] == 0
    assert not Calendar.from_ical(calendar_export(project, build_plan(project))).walk("VEVENT")


def test_old_backups_get_progress_defaults(project):
    data = project.model_dump(mode="json")
    del data["study_history"]
    del data["assessments"][0]["completed"]
    del data["settings"]["planning_style"]
    restored = Project.model_validate(data)
    assert restored.study_history == []
    assert not restored.assessments[0].completed
    assert restored.settings.planning_style == "steady"


def test_history_rejects_invalid_times_and_overlaps(project):
    block = build_plan(project).blocks[0]
    payload = {**block.model_dump(), "state": "done"}
    with pytest.raises(ValidationError):
        StudyActivity.model_validate({**payload, "minutes": 30})
    with pytest.raises(ValidationError, match="timezone"):
        StudyActivity.model_validate({**payload, "start": block.start.replace(tzinfo=None)})
    entry = StudyActivity.model_validate(payload)
    data = project.model_dump()
    data["study_history"] = [entry.model_dump(), entry.model_dump()]
    with pytest.raises(ValidationError, match="unique"):
        Project.model_validate(data)


def test_calendar_reminders_and_off_switch(project):
    parsed = Calendar.from_ical(calendar_export(project, build_plan(project)))
    events = parsed.walk("VEVENT")
    assert events[0].walk("VALARM")[0].decoded("TRIGGER") == -timedelta(days=1)
    assert events[1].walk("VALARM")[0].decoded("TRIGGER") == -timedelta(minutes=10)
    project.settings.reminder_minutes = 0
    project.settings.deadline_reminder_days = 0
    assert not Calendar.from_ical(calendar_export(project, build_plan(project))).walk("VALARM")


def test_api_session_snapshot_and_stale_replay(project):
    client = TestClient(app, base_url="http://localhost", headers={"X-Crunch-Week": "1"})
    planned = datetime(2026,10,5,12,tzinfo=timezone.utc)
    first = build_plan(project, planned).blocks[0]
    body = {"project": project.model_dump(mode="json"), "action": "done", "block_id": first.id, "planned_at": planned.isoformat()}
    response = client.post("/api/study/action", json=body)
    assert response.status_code == 200
    assert response.json()["assessments"][0]["effort_minutes"] == 180
    body["project"] = response.json()
    assert client.post("/api/study/action", json=body).status_code == 409
    body["action"] = "undo"
    assert client.post("/api/study/action", json=body).json()["assessments"][0]["effort_minutes"] == 240
    body["planned_at"] = "2026-10-05T12:00:00"
    assert client.post("/api/study/action", json=body).status_code == 422
