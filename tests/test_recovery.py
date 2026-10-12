from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from crunch_week.api import app
from crunch_week.models import Commitment, ExtraWindow, Plan, Project, Settings
from crunch_week.planner import available_slots, build_plan, weekly_summary
from crunch_week.progress import study_action
from crunch_week.recovery import apply_recovery, missing, recovery_options

NOW = datetime(2026, 10, 5, 12, tzinfo=ZoneInfo("Europe/Dublin"))


def test_partial_commitment_overlap_protects_complete_slots(project):
    project.settings.commitments = [Commitment(title="Training", weekday=0, start=time(17, 15), end=time(18, 15))]
    free = available_slots(project, NOW, Plan())[date(2026, 10, 5)]
    assert [row.time() for row in free] == [time(18, 30), time(19), time(19, 30)]
    assert weekly_summary(project, now=NOW)[0]["Capacity (h)"] == 13.5
    for block in build_plan(project, NOW).blocks:
        if block.start.weekday() == 0:
            assert block.start.time() >= time(18, 30)


def test_one_off_shift_does_not_block_the_following_week(project):
    project.settings.commitments = [Commitment(title="Extra shift", weekday=0, date=date(2026, 10, 6), start=time(17), end=time(20))]
    slots = available_slots(project, NOW, Plan())
    assert slots[date(2026, 10, 6)] == []
    assert len(slots[date(2026, 10, 13)]) == 6
    assert len(slots[date(2026, 10, 5)]) == 6


def test_overlapping_commitments_and_extra_windows_count_once(project):
    project.settings.commitments = [Commitment(title="Shift", weekday=0, start=time(17), end=time(18)), Commitment(title="Lecture", weekday=0, start=time(17, 30), end=time(18, 30))]
    project.settings.extra_windows = [ExtraWindow(date=date(2026, 10, 5), start=time(17), minutes=240)] * 2
    free = available_slots(project, NOW, Plan())[date(2026, 10, 5)]
    assert len(free) == 5
    assert len({stamp for stamp in free}) == 5
    assert free[0].time() == time(18, 30)
    project.settings.days_off = [date(2026, 10, 5)]
    assert date(2026, 10, 5) not in available_slots(project, NOW, Plan())


def overloaded(project):
    project.settings.daily_minutes = 60
    project.assessments[0].effort_minutes = 420
    return project


def test_options_match_applied_plan_and_preserve_work(project):
    overloaded(project)
    original = project.model_dump_json()
    preview = recovery_options(project, NOW)
    assert preview["baseline_minutes"] == 180
    option = preview["options"][0]
    assert option["id"] == "extra"
    assert option["added_minutes"] == 120
    assert option["recovered_minutes"] == 120
    updated = apply_recovery(project, option["id"], NOW)
    assert missing(build_plan(updated, NOW)) == option["remaining_minutes"] == 60
    assert updated.assessments == project.assessments
    assert updated.study_history == project.study_history
    assert project.model_dump_json() == original
    assert all(row.date < project.assessments[0].due_date for row in option["extra_windows"])
    assert all(row.start == time(18) for row in option["extra_windows"])


def test_recovery_preserves_work_and_training_and_days_off(project):
    overloaded(project)
    project.settings.commitments = [Commitment(title="Training", weekday=0, start=time(18), end=time(20))]
    project.settings.days_off = [date(2026, 10, 6)]
    preview = recovery_options(project, NOW)
    option = preview["options"][0]
    assert all(row.date != date(2026, 10, 6) for row in option["extra_windows"])
    monday = next(row for row in option["extra_windows"] if row.date == date(2026, 10, 5))
    assert monday.start == time(16, 30)
    updated = apply_recovery(project, "extra", NOW)
    assert updated.settings.commitments == project.settings.commitments
    assert updated.settings.days_off == project.settings.days_off


def test_using_buffer_never_moves_due_dates_or_schedules_on_deadline_day(project):
    overloaded(project)
    project.settings.buffer_days = 2
    preview = recovery_options(project, NOW)
    buffer = next(row for row in preview["options"] if row["id"] == "buffer")
    updated = apply_recovery(project, "buffer", NOW)
    assert buffer["added_minutes"] == 0
    assert buffer["recovered_minutes"] == 120
    assert updated.assessments == project.assessments
    assert all(row.end.date() < project.assessments[0].due_date for row in build_plan(updated, NOW).blocks)


def test_logged_or_skipped_slots_cannot_be_recommended_again(project):
    overloaded(project)
    first = build_plan(project, NOW).blocks[0]
    updated = study_action(project, "done", first.id, NOW)
    preview = recovery_options(updated, NOW)
    applied = apply_recovery(updated, preview["options"][0]["id"], NOW)
    assert applied.study_history == updated.study_history
    assert applied.assessments == updated.assessments
    assert all(not (row.start < first.end and row.end > first.start) for row in build_plan(applied, NOW).blocks)


def test_unrecoverable_work_is_not_hidden_or_fixed_by_inventing_hours(project):
    project.assessments[0].due_date = None
    project.assessments[0].due_time = None
    result = recovery_options(project, NOW)
    assert result["baseline_minutes"] == 240
    assert result["options"] == []
    assert result["shortfalls"][0].reason.startswith("Deadline unknown")
    with pytest.raises(ValueError, match="no longer"):
        apply_recovery(project, "extra", NOW)


def test_a_plan_that_fits_needs_no_changes(project):
    assert recovery_options(project, NOW)["options"] == []


def test_extra_suggestions_are_bounded_and_never_overnight(project):
    overloaded(project)
    project.assessments[0].due_date = date(2026, 12, 20)
    project.assessments[0].effort_minutes = 12000
    project.settings.day_start = time(22)
    result = recovery_options(project, NOW)
    option = result["options"][0]
    assert len(option["extra_windows"]) <= 10
    assert all(NOW.date() <= row.date <= NOW.date() + timedelta(days=13) for row in option["extra_windows"])
    assert all(time(7) <= row.start <= time(21, 30) for row in option["extra_windows"])


@pytest.mark.parametrize("patch", [
    {"commitments": [{"title": "Training", "weekday": 7, "start": "17:00", "end": "18:00"}]},
    {"commitments": [{"title": "Training", "weekday": 0, "start": "20:00", "end": "18:00"}]},
    {"commitments": [{"title": "", "weekday": 0, "start": "17:00", "end": "18:00"}]},
    {"commitments": [{"title": "Training", "weekday": 0, "start": "17:00", "end": "18:00", "date": "2027-01-01"}]},
    {"extra_windows": [{"date": "2027-01-01", "start": "17:00", "minutes": 30}]},
    {"extra_windows": [{"date": "2026-10-05", "start": "17:15", "minutes": 30}]},
])
def test_invalid_commitment_and_extra_time_rejected(project, patch):
    with pytest.raises(ValidationError):
        Settings.model_validate({**project.settings.model_dump(), **patch})


def test_old_backups_get_safe_defaults(project):
    legacy = project.model_dump(mode="json")
    del legacy["settings"]["commitments"]
    del legacy["settings"]["extra_windows"]
    restored = Project.model_validate(legacy)
    assert restored.settings.commitments == []
    assert restored.settings.extra_windows == []


def test_api_requires_reviewed_settings_and_rejects_stale_comparison(project, monkeypatch):
    import crunch_week.api as api

    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return NOW.astimezone(tz) if tz else NOW

    monkeypatch.setattr(api, "datetime", Clock)
    overloaded(project)
    client = TestClient(app, base_url="http://localhost")
    headers = {"X-Crunch-Week": "1"}
    assert client.post("/api/recovery", json=project.model_dump(mode="json")).status_code == 403
    response = client.post("/api/recovery", json=project.model_dump(mode="json"), headers=headers)
    assert response.status_code == 200
    option = response.json()["options"][0]
    body = {"project": project.model_dump(mode="json"), "option_id": option["id"], "expected_settings": option["settings"]}
    result = client.post("/api/recovery/apply", json=body, headers=headers)
    assert result.status_code == 200
    assert result.json()["settings"] == option["settings"]
    body["expected_settings"]["buffer_days"] = 1
    stale = client.post("/api/recovery/apply", json=body, headers=headers)
    assert stale.status_code == 409
    assert "changed" in stale.json()["detail"]


def test_next_fourteen_days_never_means_a_later_semester(project):
    overloaded(project)
    project.settings.plan_from = NOW.date() + timedelta(days=20)
    project.assessments[0].due_date = NOW.date() + timedelta(days=24)
    project.settings.buffer_days = 0
    result = recovery_options(project, NOW)
    assert result["baseline_minutes"] > 0
    assert result["options"] == []
