from datetime import date, time, timedelta

import pytest
from pydantic import ValidationError

from crunch_week.models import Assessment, Project, Settings, StudyWindow, Task
from crunch_week.planner import build_plan, weekly_summary
from crunch_week.progress import study_action


def test_custom_weekday_windows_respect_different_capacity_and_hours(project):
    project.settings.weekly_windows = [StudyWindow(weekday=0, start=time(9), minutes=60), StudyWindow(weekday=2, start=time(19), minutes=120)]
    result = build_plan(project)
    assert sum(row.minutes for row in result.blocks) == 180
    assert sum(row.minutes for row in result.shortfalls) == 60
    assert {row.start.weekday() for row in result.blocks} == {0, 2}
    assert all(row.start.hour == 9 if row.start.weekday() == 0 else row.start.hour >= 19 for row in result.blocks)
    assert weekly_summary(project)[0]["Capacity (h)"] == 3
    project.settings.days_off = [date(2026, 10, 7)]
    assert sum(row.minutes for row in build_plan(project).blocks) == 60


def test_checklists_do_not_invent_study_progress(project):
    baseline = build_plan(project)
    project.assessments[0].tasks = [Task(title="Find sources"), Task(title="Write first draft", done=True)]
    assert build_plan(project) == baseline
    assert Project.model_validate_json(project.model_dump_json()) == project
    data = project.assessments[0].model_dump()
    data["tasks"] = [data["tasks"][0]] * 2
    with pytest.raises(ValidationError, match="unique"):
        Assessment.model_validate(data)


def test_study_logs_record_actual_completion_time(project):
    first = build_plan(project).blocks[0]
    updated = study_action(project, "done", first.id)
    assert updated.study_history[0].logged_at.tzinfo is not None
    legacy = updated.model_dump(mode="json")
    del legacy["study_history"][0]["logged_at"]
    assert Project.model_validate(legacy).study_history[0].logged_at is None


@pytest.mark.parametrize("patch", [{"weekly_goal_minutes": 0}, {"weekly_goal_minutes": 31}, {"weekly_windows": [{"weekday": 7, "start": "17:00", "minutes": 60}]}, {"weekly_windows": [{"weekday": 0, "start": "23:30", "minutes": 60}]}, {"weekly_windows": [{"weekday": 0, "start": "17:00", "minutes": 60}] * 2}])
def test_invalid_goal_and_weekday_hours_rejected(project, patch):
    with pytest.raises(ValidationError):
        Settings.model_validate({**project.settings.model_dump(), **patch})


def test_custom_windows_conserve_work_without_overlapping(project):
    project.assessments += [Assessment(module="Other", title="Later essay", due_date=date(2026,10,15), effort_minutes=600, reviewed=True)]
    project.settings.weekly_windows = [StudyWindow(weekday=day, start=time(10 + day), minutes=30 * (day+1)) for day in range(5)]
    result = build_plan(project)
    assert sum(b.minutes for b in result.blocks) + sum(s.minutes for s in result.shortfalls) == 840
    assert all(a.end <= b.start for a,b in zip(result.blocks, result.blocks[1:], strict=False))
    for day in {b.start.date() for b in result.blocks}:
        blocks = [b for b in result.blocks if b.start.date() == day]
        assert sum(b.minutes for b in blocks) <= 30 * (day.weekday() + 1)
        assert blocks[0].start.time() >= time(10 + day.weekday())
        assert blocks[-1].end <= blocks[0].start.replace(hour=10+day.weekday(), minute=0) + timedelta(minutes=30*(day.weekday()+1))
