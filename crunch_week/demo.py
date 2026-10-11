"""Synthetic demo data. Dates shift together so the walkthrough stays useful."""

from datetime import date, time, timedelta

from crunch_week.models import Assessment, Project, Settings, stable_id

DEMO_ITEMS = [
    ("CS401 · Applied AI", "Model evaluation report", "Assignment", 51, 30, 360),
    ("PS402 · Research Methods", "Research proposal", "Assignment", 58, 20, 240),
    ("CS401 · Applied AI", "AI prototype", "Project", 64, 40, 480),
    ("BS403 · Innovation", "Team pitch", "Presentation", 65, 30, 300),
    ("PS402 · Research Methods", "Research portfolio", "Project", 66, 50, 540),
    ("BS403 · Innovation", "Individual reflection", "Assignment", 67, 20, 240),
    ("CS401 · Applied AI", "Final exam", "Exam", 78, 30, 600),
    ("PS402 · Research Methods", "Methods quiz", "Quiz", 80, 30, 180),
    ("BS403 · Innovation", "Venture report", "Assignment", 81, 50, 480),
]


def demo_project(today: date) -> Project:
    start = today - timedelta(days=today.weekday(), weeks=6)
    items = []
    for module, title, kind, offset, weight, minutes in DEMO_ITEMS:
        due = start + timedelta(days=offset)
        code = module.split(" · ")[0]
        items.append(
            Assessment(
                id=stable_id("demo", module, title),
                module=module,
                title=title,
                kind=kind,
                due_date=due,
                due_time=time(17),
                weight_percent=weight,
                effort_minutes=minutes,
                source_file=f"{code}_synthetic_demo.pdf",
                source_page=1,
                evidence=f"{title}: due {due.isoformat()} at 17:00; weighting {weight}% of this module.",
                notes="Synthetic demo; dates move relative to today. Effort is an editable estimate.",
                reviewed=True,
            )
        )
    return Project(
        name="Autumn semester",
        settings=Settings(semester_start=start, semester_end=start + timedelta(days=83), plan_from=today),
        assessments=items,
        demo=True,
    )
