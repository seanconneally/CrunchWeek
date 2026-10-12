"""Explicit student check-ins, separate from logged time and submission status."""

from uuid import UUID

from crunch_week.models import Project


def check_in(
    project: Project,
    assessment_id: UUID,
    activity_id: UUID,
    status: str,
    expected_remaining: int,
    remaining_minutes: int | None,
) -> Project:
    current = project.model_copy(deep=True)
    item = next((row for row in current.assessments if row.id == assessment_id), None)
    entry = next((row for row in current.study_history if row.id == activity_id), None)
    latest = next(
        (row for row in reversed(current.study_history) if row.assessment_id == assessment_id and row.state == "done"),
        None,
    )
    if (
        item is None
        or entry is None
        or entry.state != "done"
        or entry.assessment_id != assessment_id
        or entry != latest
    ):
        raise ValueError("Use the latest completed session for this assessment.")
    if item.completed:
        raise ValueError("This assessment is already submitted. Reopen it before changing its study estimate.")
    if item.effort_minutes != expected_remaining:
        raise ValueError("Your estimate changed in the app. Use the latest estimate before confirming.")
    if entry.feedback is not None:
        raise ValueError("This session already has a progress check. Edit the assessment to adjust its estimate.")
    if status == "on_track":
        remaining = item.effort_minutes
    elif status == "finished":
        remaining = 0
    elif status == "need_more_time" and remaining_minutes is not None and remaining_minutes > item.effort_minutes:
        remaining = remaining_minutes
    else:
        raise ValueError("Enter a larger remaining-work estimate, in half-hour steps.")
    entry.feedback_previous_remaining = item.effort_minutes
    entry.reported_remaining = remaining
    entry.feedback = status
    item.effort_minutes = remaining
    return Project.model_validate(current.model_dump())
