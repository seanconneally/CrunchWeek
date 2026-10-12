"""Deterministic, capacity-constrained planning without AI scheduling decisions."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from crunch_week.models import Plan, Project, Shortfall, StudyBlock, local_datetime, stable_id


def available_slots(project: Project, now: datetime | None, plan: Plan) -> dict[date, list[datetime]]:
    settings = project.settings
    slots: dict[date, list[datetime]] = {}
    occupied = {
        entry.start.astimezone(timezone.utc) + timedelta(minutes=offset)
        for entry in project.study_history for offset in range(0, entry.minutes, 30)
    }
    custom = {window.weekday: window for window in settings.weekly_windows}
    day = settings.plan_from
    while day <= settings.semester_end:
        window = custom.get(day.weekday())
        eligible = window is not None if custom else day.weekday() in settings.weekdays
        windows = [(window.start if window else settings.day_start,
                    window.minutes if window else settings.daily_minutes)] if eligible else []
        windows += [(row.start, row.minutes) for row in settings.extra_windows if row.date == day]
        if windows and day not in settings.days_off:
            values = set()
            commitments = [row for row in settings.commitments if (row.date == day if row.date else row.weekday == day.weekday())]
            for clock, minutes in windows:
                for offset in range(0, minutes, 30):
                    naive = datetime.combine(day, clock) + timedelta(minutes=offset)
                    end_naive = naive + timedelta(minutes=30)
                    # Any overlap, including a 17:15 lecture, protects the whole slot.
                    if any(naive.time() < row.end and end_naive.time() > row.start for row in commitments):
                        continue
                    try:
                        candidate = local_datetime(day, naive.time(), settings.timezone)
                        end = local_datetime(day, end_naive.time(), settings.timezone)
                    except ValueError:
                        warning = f"Skipped ambiguous or nonexistent study slots on {day}: daylight-saving transition."
                        if warning not in plan.warnings:
                            plan.warnings.append(warning)
                        continue
                    stamp = candidate.astimezone(timezone.utc)
                    if (end.astimezone(timezone.utc) - stamp).total_seconds() != 1800:
                        continue
                    if stamp in occupied:
                        continue
                    if now is None or stamp >= now.astimezone(timezone.utc):
                        values.add(candidate)
            # Union overlapping windows: adding one-off time cannot double capacity.
            slots[day] = sorted(values)
        day += timedelta(days=1)

    return slots


def build_plan(project: Project, now: datetime | None = None) -> Plan:
    """Earliest deadlines get priority; steady mode spreads sessions across free days.

    Study happens strictly before the due date; buffer_days adds extra clear days.
    This is a transparent heuristic, not a prediction of academic effort.
    """
    settings = project.settings
    if now is not None and now.tzinfo is None:
        raise ValueError("now must be timezone-aware")
    plan = Plan()
    slots = available_slots(project, now, plan)
    used: dict[date, int] = defaultdict(int)

    items = sorted(project.assessments, key=lambda a: (a.due_date or date.max, str(a.id)))
    for item in items:
        label = f"{item.module} · {item.title}"
        if item.completed:
            continue
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
        if settings.planning_style == "deadline":
            for available_day in sorted(slots, reverse=True):
                if available_day > cutoff:
                    continue
                while slots[available_day] and remaining > 0:
                    allocated.append(slots[available_day].pop())
                    remaining -= 30
                if remaining == 0:
                    break
        else:
            # One session per turn on the least-loaded day. Tie-break toward an
            # earlier start, rather than leaving all work until deadline week.
            while remaining:
                days = [day for day, free in slots.items() if free and day <= cutoff]
                if not days:
                    break
                available_day = min(days, key=lambda day: (used[day], day))
                free = slots[available_day]
                taken = 0
                while free and remaining and taken < settings.block_minutes:
                    if taken and free[0] != allocated[-1] + timedelta(minutes=30):
                        break
                    allocated.append(free.pop(0))
                    remaining -= 30
                    used[available_day] += 30
                    taken += 30

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
        for group in groups:
            plan.blocks.append(
                StudyBlock(
                    id=stable_id(str(item.id), "study", group[0].isoformat(), str(len(group) * 30)),
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


def weekly_summary(project: Project, plan: Plan | None = None, now: datetime | None = None) -> list[dict]:
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
            "Capacity (h)": 0.0,
            "Planned (h)": 0.0,
            "Load percent": 0.0,
        }
    for item in project.assessments:
        if item.completed or not item.reviewed or item.due_date is None:
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
    for day, free in available_slots(project, now, Plan()).items():
        index = (day - settings.semester_start).days // 7
        weeks[index]["Capacity (h)"] += len(free) / 2
    for block in (plan or build_plan(project, now)).blocks:
        index = (block.start.date() - settings.semester_start).days // 7
        weeks[index]["Planned (h)"] += block.minutes / 60
    for week in weeks.values():
        effort, capacity = week["Effort (h)"], week["Capacity (h)"]
        ratio = effort / capacity if capacity else (2 if effort else 0)
        week["Load percent"] = round(ratio * 100)
        week["Pressure"] = "Crunch" if ratio > 1 else "Busy" if ratio >= .75 else "Steady" if effort else "Clear"
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
