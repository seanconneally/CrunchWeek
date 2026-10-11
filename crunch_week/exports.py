"""Portable exports with proper calendar escaping and spreadsheet-safe CSV cells."""

import csv
import io
from datetime import datetime, timedelta, timezone

from icalendar import Calendar, Event

from crunch_week.models import Plan, Project, local_datetime


def safe_cell(value: object) -> str:
    text = "" if value is None else str(value)
    return "'" + text if text.lstrip().startswith(("=", "+", "-", "@", "\t", "\r")) else text


def csv_export(project: Project) -> bytes:
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(
        [
            "Module",
            "Assessment",
            "Type",
            "Due date",
            "Due time",
            "Timezone",
            "Weight (%)",
            "Effort (h)",
            "Reviewed",
            "Source",
            "Page",
            "Evidence",
            "Notes",
        ]
    )
    for item in project.assessments:
        writer.writerow(
            [
                safe_cell(v)
                for v in [
                    item.module,
                    item.title,
                    item.kind,
                    item.due_date,
                    item.due_time,
                    project.settings.timezone,
                    item.weight_percent,
                    item.effort_minutes / 60,
                    item.reviewed,
                    item.source_file,
                    item.source_page,
                    item.evidence,
                    item.notes,
                ]
            ]
        )
    return output.getvalue().encode("utf-8-sig")


def calendar_export(project: Project, plan: Plan) -> bytes:
    calendar = Calendar()
    calendar.add("prodid", "-//Crunch Week//Semester Planner//EN")
    calendar.add("version", "2.0")
    calendar.add("x-wr-calname", f"Crunch Week · {project.name}")
    stamp = datetime.now(timezone.utc)
    for item in project.assessments:
        if not item.reviewed or not item.due_date:
            continue
        event = Event()
        event.add("uid", f"{project.id}-{item.id}@crunchweek.local")
        event.add("dtstamp", stamp)
        event.add("summary", f"DUE · {item.module} · {item.title}")
        if item.due_time:
            event.add(
                "dtstart",
                local_datetime(item.due_date, item.due_time, project.settings.timezone).astimezone(timezone.utc),
            )
        else:
            event.add("dtstart", item.due_date)
            event.add("dtend", item.due_date + timedelta(days=1))
        event.add(
            "description",
            f"Weight: {item.weight_percent if item.weight_percent is not None else 'unknown'}% of {item.module}\n"
            f"Source: {item.source_file}, page {item.source_page or 'n/a'}\n{item.evidence}\n{item.notes}",
        )
        event.add("transp", "TRANSPARENT")
        calendar.add_component(event)
    for block in plan.blocks:
        event = Event()
        event.add("uid", f"{project.id}-{block.id}@crunchweek.local")
        event.add("dtstamp", stamp)
        event.add("summary", f"STUDY · {block.module} · {block.title}")
        event.add("dtstart", block.start.astimezone(timezone.utc))
        event.add("dtend", block.end.astimezone(timezone.utc))
        event.add("description", "Suggested study block based on your remaining effort estimate. Adjust as needed.")
        calendar.add_component(event)
    return calendar.to_ical()
