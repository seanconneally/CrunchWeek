"""Reversible study actions; only sessions in the current plan can be logged."""
from datetime import datetime, timezone

from crunch_week.models import Project, StudyActivity
from crunch_week.planner import build_plan


def study_action(project: Project, action: str, block_id: str, now: datetime | None = None) -> Project:
    current = project.model_copy(deep=True)
    if action == "undo":
        entry = next((row for row in current.study_history if str(row.id) == block_id), None)
        if entry is None:
            raise ValueError("This session has already been undone.")
        item = next((item for item in current.assessments if item.id == entry.assessment_id), None)
        if entry.state == "done" and item is not None:
            # Undo a check-in with its session if the reported estimate is still
            # current. A later manual estimate takes priority and is preserved.
            latest = next((row for row in reversed(current.study_history)
                           if row.assessment_id == entry.assessment_id and row.state == "done"), None)
            remaining = (entry.feedback_previous_remaining
                         if entry.feedback and entry == latest and item.effort_minutes == entry.reported_remaining
                         else item.effort_minutes)
            if remaining + entry.minutes > 12000:
                raise ValueError("Reduce the remaining work estimate before undoing this session.")
            item.effort_minutes = remaining + entry.minutes
        current.study_history.remove(entry)
    else:
        block = next((row for row in build_plan(current, now).blocks if row.id == block_id), None)
        if block is None:
            raise ValueError("This session changed. Refresh your plan and try again.")
        remaining_before = None
        if action == "done":
            item = next(item for item in current.assessments if item.id == block.assessment_id)
            remaining_before = item.effort_minutes
            item.effort_minutes -= block.minutes
        elif action != "skipped":
            raise ValueError("Unknown study action.")
        current.study_history.append(StudyActivity(**block.model_dump(), state=action, logged_at=datetime.now(timezone.utc), remaining_before=remaining_before))
    return Project.model_validate(current.model_dump())
