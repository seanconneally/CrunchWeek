from datetime import date, time

import pytest

from crunch_week.models import Assessment, Project, Settings


@pytest.fixture
def project():
    return Project(
        settings=Settings(
            semester_start=date(2026, 10, 5),
            semester_end=date(2026, 12, 27),
            plan_from=date(2026, 10, 5),
            weekdays=[0, 1, 2, 3, 4],
            day_start=time(17),
            daily_minutes=180,
        ),
        assessments=[
            Assessment(
                module="CS401",
                title="AI project",
                due_date=date(2026, 10, 9),
                due_time=time(17),
                weight_percent=40,
                effort_minutes=240,
                reviewed=True,
            )
        ],
    )
