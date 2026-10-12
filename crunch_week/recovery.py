"""Reviewed capacity changes, measured with the actual planner at one fixed instant."""
from __future__ import annotations

from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from crunch_week.models import ExtraWindow, Plan, Project
from crunch_week.planner import available_slots, build_plan


def missing(plan: Plan) -> int:
    return sum(row.minutes for row in plan.shortfalls)


def add_time(project: Project, now: datetime) -> Project:
    candidate = project.model_copy(deep=True)
    settings = candidate.settings
    today = now.astimezone(ZoneInfo(settings.timezone)).date()
    day = max(settings.plan_from, today)
    last = min(today + timedelta(days=13), settings.semester_end)
    custom = {row.weekday: row for row in settings.weekly_windows}
    remaining = missing(build_plan(candidate, now))
    while day <= last and remaining and len(settings.extra_windows) < 90:
        window = custom.get(day.weekday())
        eligible = window is not None if custom else day.weekday() in settings.weekdays
        if eligible and day not in settings.days_off:
            clock = window.start if window else settings.day_start
            duration = window.minutes if window else settings.daily_minutes
            begin = clock.hour * 60 + clock.minute
            end = begin + duration
            # Offer at most 30 extra minutes per study day, near existing hours.
            # Avoid overnight recommendations and keep daily free capacity <= 8h.
            free = available_slots(candidate, now, Plan()).get(day, [])
            for minute in list(range(end, min(end + 120, 1320), 30)) + list(range(begin - 30, max(begin - 150, 390), -30)):
                if not 420 <= minute <= 1290 or len(free) >= 16:
                    continue
                row = ExtraWindow(date=day, start=time(minute // 60, minute % 60), minutes=30)
                settings.extra_windows.append(row)
                trial_free = available_slots(candidate, now, Plan()).get(day, [])
                if len(trial_free) <= len(free):
                    settings.extra_windows.pop()
                    continue
                trial_remaining = missing(build_plan(candidate, now))
                if trial_remaining < remaining:
                    remaining = trial_remaining
                else:
                    settings.extra_windows.pop()
                # All half-hours on this date share the same deadline cutoffs.
                break
        day += timedelta(days=1)
    return Project.model_validate(candidate.model_dump())


def recovery_options(project: Project, now: datetime) -> dict:
    baseline = build_plan(project, now)
    before = {row.assessment_id: row.minutes for row in baseline.shortfalls}
    baseline_minutes = missing(baseline)
    options = []

    def offer(key: str, title: str, candidate: Project) -> None:
        plan = build_plan(candidate, now)
        after = {row.assessment_id: row.minutes for row in plan.shortfalls}
        recovered = baseline_minutes - missing(plan)
        if recovered <= 0:
            return
        added = candidate.settings.extra_windows[len(project.settings.extra_windows):]
        options.append({
            "id": key, "title": title,
            "recovered_minutes": recovered, "remaining_minutes": missing(plan),
            "added_minutes": sum(row.minutes for row in added),
            "extra_windows": added, "buffer_days": candidate.settings.buffer_days,
            "settings": candidate.settings,
            "impacts": [{"assessment_id": item.id, "module": item.module, "title": item.title,
                         "due_date": item.due_date, "before_minutes": before.get(item.id, 0),
                         "after_minutes": after.get(item.id, 0)}
                        for item in project.assessments if before.get(item.id, 0) != after.get(item.id, 0)],
        })

    if baseline_minutes:
        if project.settings.buffer_days:
            relaxed = project.model_copy(deep=True)
            relaxed.settings.buffer_days = 0
            offer("buffer", "Use the extra buffer days", relaxed)
        extra = add_time(project, now)
        offer("extra", "Add small sessions for the next 14 days", extra)
        if project.settings.buffer_days and extra.settings.extra_windows != project.settings.extra_windows:
            relaxed = project.model_copy(deep=True)
            relaxed.settings.buffer_days = 0
            combined = add_time(relaxed, now)
            offer("combined", "Combine extra time and a smaller buffer", combined)
    # Alternatives that produce identical settings/results add no useful choice.
    unique = []
    for option in options:
        if not any(option["settings"] == existing["settings"] for existing in unique):
            unique.append(option)
    return {"planned_at": now, "baseline_minutes": baseline_minutes,
            "shortfalls": baseline.shortfalls, "options": unique}


def apply_recovery(project: Project, option_id: str, now: datetime) -> Project:
    for option in recovery_options(project, now)["options"]:
        if option["id"] == option_id:
            candidate = project.model_copy(deep=True)
            candidate.settings = option["settings"]
            return Project.model_validate(candidate.model_dump())
    raise ValueError("This option no longer recovers work. Compare your current plan again.")
