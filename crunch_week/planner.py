"""Deterministic, capacity-constrained planning without AI scheduling decisions."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from crunch_week.models import Plan, Project, Shortfall, StudyBlock, local_datetime, stable_id


def build_plan(project: Project, now: datetime | None = None) -> Plan:
    """Earliest deadlines get first choice of the latest available half-hour slots.

    Study happens strictly before the due date; buffer_days adds extra clear days.
    This is a transparent heuristic, not a prediction of academic effort.
    """
    settings = project.settings
    if now is not None and now.tzinfo is None:
        raise ValueError("now must be timezone-aware")
    slots: dict[date, list[datetime]] = {}
    plan = Plan()
    day = settings.plan_from
    while day <= settings.semester_end:
        if day.weekday() in settings.weekdays and day not in settings.days_off:
            try:
                start = local_datetime(day, settings.day_start, settings.timezone)
                values = []
                for offset in range(0, settings.daily_minutes, 30):
                    naive = start.replace(tzinfo=None) + timedelta(minutes=offset)
                    candidate = local_datetime(day, naive.time(), settings.timezone)
                    end_naive = naive + timedelta(minutes=30)
                    end = local_datetime(day, end_naive.time(), settings.timezone)
                    if (end.astimezone(timezone.utc) - candidate.astimezone(timezone.utc)).total_seconds() != 1800:
                        continue
                    if now is None or candidate.astimezone(timezone.utc) >= now.astimezone(timezone.utc):
                        values.append(candidate)
                slots[day] = values
            except ValueError:
                plan.warnings.append(f"Skipped {day}: study hours intersect a daylight-saving transition.")
        day += timedelta(days=1)

    items = sorted(project.assessments, key=lambda a: (a.due_date or date.max, str(a.id)))
    for item in items:
        label = f"{item.module} · {item.title}"
        if not item.reviewed:
            plan.warnings.append(f"{label}: review needed; excluded from study planning.")
            continue
        if item.effort_minutes == 0:
            continue
        reason = ""
        if item.due_date is None:
            reason = "Deadline unknown; add a confirmed date."
        elif not settings.semester_start <= item.due_date <= settings.semester_end:
            reason = "Deadline is outside the semester; check the date or semester settings."
        elif item.due_date <= settings.plan_from:
            reason = "Deadline is on or before planning starts."
        if reason:
            plan.shortfalls.append(
                Shortfall(assessment_id=item.id, label=label, minutes=item.effort_minutes, reason=reason)
            )
            continue
        cutoff = item.due_date - timedelta(days=1 + settings.buffer_days)
        remaining = item.effort_minutes
        allocated: list[datetime] = []
        for available_day in sorted(slots, reverse=True):
            if available_day > cutoff:
                continue
            while slots[available_day] and remaining > 0:
                allocated.append(slots[available_day].pop())
                remaining -= 30
            if remaining == 0:
                break

        # Coalesce adjacent half-hour slots, capped at the requested block length.
        groups: list[list[datetime]] = []
        for stamp in sorted(allocated):
            if (
                groups
                and stamp.date() == groups[-1][-1].date()
                and stamp == groups[-1][-1] + timedelta(minutes=30)
                and len(groups[-1]) * 30 < settings.block_minutes
            ):
                groups[-1].append(stamp)
            else:
                groups.append([stamp])
        for index, group in enumerate(groups):
            plan.blocks.append(
                StudyBlock(
                    id=stable_id(str(item.id), "study", str(index)),
                    assessment_id=item.id,
                    module=item.module,
                    title=item.title,
                    start=group[0],
                    end=group[-1] + timedelta(minutes=30),
                    minutes=len(group) * 30,
                )
            )
        if remaining:
            plan.shortfalls.append(
                Shortfall(
                    assessment_id=item.id,
                    label=label,
                    minutes=remaining,
                    reason="Not enough available time before the deadline and buffer.",
                )
            )
    plan.blocks.sort(key=lambda block: block.start)
    return plan


def weekly_summary(project: Project) -> list[dict]:
    """Calendar weeks are relative to semester_start, including zero-load weeks."""
    settings = project.settings
    weeks: dict[int, dict] = {}
    count = (settings.semester_end - settings.semester_start).days // 7 + 1
    for index in range(count):
        weeks[index] = {
            "Week": index + 1,
            "Starting": settings.semester_start + timedelta(weeks=index),
            "Deadlines": 0,
            "Effort (h)": 0.0,
            "Module weights": {},
            "Pressure": "Clear",
        }
    for item in project.assessments:
        if not item.reviewed or item.due_date is None:
            continue
        index = (item.due_date - settings.semester_start).days // 7
        if not settings.semester_start <= item.due_date <= settings.semester_end:
            continue
        week = weeks[index]
        week["Deadlines"] += 1
        week["Effort (h)"] += item.effort_minutes / 60
        if item.weight_percent is not None:
            weights = week["Module weights"]
            weights[item.module] = weights.get(item.module, 0) + item.weight_percent
    for week in weeks.values():
        count = week["Deadlines"]
        week["Pressure"] = "Crunch" if count >= 3 else "Busy" if count == 2 else "Steady" if count else "Clear"
    return list(weeks.values())


def review_warnings(project: Project) -> list[str]:
    warnings = []
    weights: dict[str, float] = defaultdict(float)
    names: dict[tuple[str, str], int] = defaultdict(int)
    for item in project.assessments:
        names[(item.module.casefold(), item.title.casefold())] += 1
        if item.weight_percent is not None:
            weights[item.module] += item.weight_percent
        if item.due_date and not project.settings.semester_start <= item.due_date <= project.settings.semester_end:
            warnings.append(f"{item.module} · {item.title}: deadline outside this semester.")
        if item.due_date is None:
            warnings.append(f"{item.module} · {item.title}: deadline is still unknown.")
    warnings.extend(
        f"{module}: assessment weights total {weight:g}%; check duplicates or alternative assessments."
        for module, weight in weights.items()
        if weight > 100
    )
    warnings.extend(f"Possible duplicate: {module} · {title}." for (module, title), count in names.items() if count > 1)
    return warnings
