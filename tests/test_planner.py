from collections import defaultdict
from datetime import date, datetime, time, timezone

import pytest
from pydantic import ValidationError

from crunch_week.models import Assessment, Project, Settings, local_datetime
from crunch_week.planner import build_plan, review_warnings, weekly_summary


def test_schedule_conserves_effort_and_never_overlaps(project):
    project.assessments += [
        Assessment(module="Other", title="Exam", due_date=date(2026, 10, 9), effort_minutes=600, reviewed=True)
    ]
    plan = build_plan(project)
    by_day = defaultdict(int)
    per_item = defaultdict(int)
    for block in plan.blocks:
        by_day[block.start.date()] += block.minutes
        per_item[block.assessment_id] += block.minutes
        assert block.start.date() < date(2026, 10, 9)
        assert block.minutes <= project.settings.block_minutes
    for row in plan.shortfalls:
        per_item[row.assessment_id] += row.minutes
    assert all(total <= 180 for total in by_day.values())
    assert all(left.end <= right.start for left, right in zip(plan.blocks, plan.blocks[1:], strict=False))
    assert all(per_item[item.id] == item.effort_minutes for item in project.assessments)
    assert plan.shortfalls


def test_backwards_scheduling_and_determinism(project):
    first = build_plan(project)
    assert first == build_plan(project)
    assert first.blocks[-1].end == datetime(2026, 10, 8, 20, tzinfo=project_zone(project))
    assert first.blocks[0].start.date() == date(2026, 10, 7)


def project_zone(project):
    from zoneinfo import ZoneInfo

    return ZoneInfo(project.settings.timezone)


def test_days_off_buffer_and_now(project):
    project.settings.days_off = [date(2026, 10, 7)]
    project.settings.buffer_days = 1
    now = datetime(2026, 10, 6, 17, 45, tzinfo=project_zone(project))
    result = build_plan(project, now)
    assert all(block.start >= now for block in result.blocks)
    assert {block.start.date() for block in result.blocks} == {date(2026, 10, 6)}
    assert sum(block.minutes for block in result.blocks) == 120
    assert result.shortfalls[0].minutes == 120


def test_unreviewed_unknown_past_and_outside_are_visible(project):
    project.assessments = [
        Assessment(module="A", title="Pending", due_date=date(2026, 10, 9)),
        Assessment(module="B", title="Unknown", reviewed=True),
        Assessment(module="C", title="Overdue", due_date=date(2026, 10, 5), reviewed=True),
        Assessment(module="D", title="Outside", due_date=date(2027, 1, 1), reviewed=True),
    ]
    result = build_plan(project)
    assert not result.blocks
    assert len(result.shortfalls) == 3
    assert len(result.warnings) == 1


def test_clashes_keep_module_weights_separate(project):
    project.assessments += [
        Assessment(module="Other", title=f"Essay {i}", due_date=date(2026, 10, 8), weight_percent=50, reviewed=True)
        for i in range(2)
    ]
    week = weekly_summary(project)[0]
    assert week["Pressure"] == "Crunch"
    assert week["Module weights"] == {"CS401": 40, "Other": 100}
    assert week["Deadlines"] == 3


def test_weight_and_duplicate_warnings(project):
    project.assessments += [Assessment(module="CS401", title="AI project", weight_percent=80)]
    warnings = review_warnings(project)
    assert any("120%" in warning for warning in warnings)
    assert any("duplicate" in warning for warning in warnings)


@pytest.mark.parametrize("day", [date(2026, 3, 29), date(2026, 10, 25)])
def test_dst_gap_and_fold_rejected(day):
    with pytest.raises(ValueError, match="daylight saving"):
        local_datetime(day, time(1, 30), "Europe/Dublin")


def test_dst_normal_time_is_valid():
    value = local_datetime(date(2026, 10, 25), time(17), "Europe/Dublin")
    assert value.astimezone(timezone.utc).hour == 17


@pytest.mark.parametrize(
    "patch",
    [
        {"weekdays": []},
        {"weekdays": [1, 1]},
        {"weekdays": [8]},
        {"timezone": "Mars/Moon"},
        {"daily_minutes": 31},
        {"day_start": "23:00", "daily_minutes": 180},
        {"semester_end": "2026-10-01"},
        {"plan_from": "2025-01-01"},
    ],
)
def test_invalid_settings_rejected(project, patch):
    with pytest.raises(ValidationError):
        Settings.model_validate({**project.settings.model_dump(), **patch})


@pytest.mark.parametrize(
    "patch",
    [
        {"weight_percent": 101},
        {"effort_minutes": -30},
        {"effort_minutes": 31},
        {"due_date": None, "due_time": "17:00"},
        {"module": " "},
        {"weight_percent": float("nan")},
    ],
)
def test_invalid_assessment_rejected(project, patch):
    with pytest.raises(ValidationError):
        Assessment.model_validate({**project.assessments[0].model_dump(), **patch})


def test_backup_rejects_duplicate_ids_and_secrets(project):
    data = project.model_dump()
    data["assessments"] *= 2
    with pytest.raises(ValidationError, match="unique"):
        Project.model_validate(data)
    data = project.model_dump()
    data["api_key"] = "secret"
    with pytest.raises(ValidationError):
        Project.model_validate(data)


def test_randomized_capacity_invariants(project):
    import random
    from datetime import timedelta

    rng = random.Random(42)
    for _ in range(50):
        project.assessments = [
            Assessment(
                module="CS",
                title=f"Work {i}",
                due_date=date(2026, 10, 6) + timedelta(days=rng.randrange(20)),
                effort_minutes=30 * rng.randrange(1, 40),
                reviewed=True,
            )
            for i in range(8)
        ]
        plan = build_plan(project)
        allocated = defaultdict(int)
        capacity = defaultdict(int)
        due = {item.id: item.due_date for item in project.assessments}
        for block in plan.blocks:
            allocated[block.assessment_id] += block.minutes
            capacity[block.start.date()] += block.minutes
            assert block.start.date() < due[block.assessment_id]
            assert block.start.weekday() < 5
            assert block.start.hour >= 17 and block.end.hour <= 20
        for row in plan.shortfalls:
            allocated[row.assessment_id] += row.minutes
        assert all(cap <= 180 for cap in capacity.values())
        assert all(a.end <= b.start for a, b in zip(plan.blocks, plan.blocks[1:], strict=False))
        assert all(allocated[item.id] == item.effort_minutes for item in project.assessments)


def test_default_and_demo_cover_twelve_complete_weeks():
    from crunch_week.demo import demo_project
    from crunch_week.models import new_project

    for project in (new_project(date(2026, 10, 9)), demo_project(date(2026, 10, 9))):
        assert len(weekly_summary(project)) == 12
        assert (project.settings.semester_end - project.settings.semester_start).days == 83
