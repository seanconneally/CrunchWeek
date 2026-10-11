"""Validated domain objects shared by the UI, planner and integrations."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Literal
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

AssessmentKind = Literal["Assignment", "Exam", "Project", "Presentation", "Quiz", "Other"]


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False)


def stable_id(*parts: str) -> str:
    return str(uuid5(NAMESPACE_URL, "crunch-week:" + "|".join(p.casefold().strip() for p in parts)))


def local_datetime(day: date, clock: time, zone: str) -> datetime:
    """Reject ambiguous/nonexistent wall times instead of silently shifting them."""
    naive = datetime.combine(day, clock)
    tz = ZoneInfo(zone)
    candidates = [naive.replace(tzinfo=tz, fold=fold) for fold in (0, 1)]
    valid = [d for d in candidates if d.astimezone(timezone.utc).astimezone(tz).replace(tzinfo=None) == naive]
    if not valid or (len(valid) == 2 and valid[0].utcoffset() != valid[1].utcoffset()):
        raise ValueError("This time is skipped or repeated by daylight saving. Choose another time.")
    return valid[0]


class Assessment(Model):
    id: UUID = Field(default_factory=uuid4)
    module: str = Field(min_length=1, max_length=120)
    title: str = Field(min_length=1, max_length=200)
    kind: AssessmentKind = "Assignment"
    due_date: date | None = None
    due_time: time | None = None
    weight_percent: float | None = Field(default=None, ge=0, le=100)
    effort_minutes: int = Field(default=240, ge=0, le=12000, multiple_of=30)
    source_file: str = Field(default="Manual entry", max_length=255)
    source_page: int | None = Field(default=None, ge=1, le=50)
    evidence: str = Field(default="", max_length=1500)
    notes: str = Field(default="", max_length=2000)
    reviewed: bool = False

    @field_validator("due_time")
    @classmethod
    def wall_time_only(cls, value: time | None) -> time | None:
        if value and (value.tzinfo is not None or value.second or value.microsecond):
            raise ValueError("Use a local HH:MM time, without seconds or a timezone offset.")
        return value

    @model_validator(mode="after")
    def time_needs_date(self) -> Assessment:
        if self.due_time and not self.due_date:
            raise ValueError("A deadline time needs a deadline date.")
        return self


class Settings(Model):
    semester_start: date
    semester_end: date
    plan_from: date
    timezone: str = "Europe/Dublin"
    weekdays: list[int] = Field(default_factory=lambda: [0, 1, 2, 3, 4], min_length=1, max_length=7)
    day_start: time = time(17)
    daily_minutes: int = Field(default=180, ge=30, le=480, multiple_of=30)
    block_minutes: Literal[30, 60, 90, 120] = 60
    buffer_days: int = Field(default=0, ge=0, le=14)
    days_off: list[date] = Field(default_factory=list, max_length=370)

    @field_validator("timezone")
    @classmethod
    def valid_zone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("Use an IANA timezone such as Europe/Dublin.") from exc
        return value

    @field_validator("weekdays")
    @classmethod
    def valid_days(cls, value: list[int]) -> list[int]:
        if len(set(value)) != len(value) or any(day not in range(7) for day in value):
            raise ValueError("Choose distinct weekdays from 0 (Monday) to 6 (Sunday).")
        return sorted(value)

    @model_validator(mode="after")
    def valid_window(self) -> Settings:
        if not 0 < (self.semester_end - self.semester_start).days <= 370:
            raise ValueError("Semester end must be 1–370 days after the start.")
        if not self.semester_start <= self.plan_from <= self.semester_end:
            raise ValueError("Planning start must fall within the semester.")
        if self.day_start.tzinfo or self.day_start.second or self.day_start.microsecond:
            raise ValueError("Study start must be a local HH:MM time.")
        if self.day_start.minute % 30:
            raise ValueError("Study start must be on the hour or half hour.")
        if self.day_start.hour * 60 + self.day_start.minute + self.daily_minutes >= 1440:
            raise ValueError("The study window must finish before midnight.")
        return self


class NotionTarget(Model):
    database_id: UUID
    data_source_id: UUID

    @property
    def url(self) -> str:
        return f"https://www.notion.so/{self.database_id.hex}"


class Project(Model):
    version: Literal[1] = 1
    id: UUID = Field(default_factory=uuid4)
    name: str = Field(default="My semester", min_length=1, max_length=100)
    settings: Settings
    assessments: list[Assessment] = Field(default_factory=list, max_length=300)
    notion: NotionTarget | None = None
    demo: bool = False

    @model_validator(mode="after")
    def distinct_ids(self) -> Project:
        ids = [item.id for item in self.assessments]
        if len(ids) != len(set(ids)):
            raise ValueError("Assessment IDs must be unique.")
        for item in self.assessments:
            if item.due_date and item.due_time:
                local_datetime(item.due_date, item.due_time, self.settings.timezone)
        return self


class StudyBlock(Model):
    id: str
    assessment_id: UUID
    module: str
    title: str
    start: datetime
    end: datetime
    minutes: int


class Shortfall(Model):
    assessment_id: UUID
    label: str
    minutes: int
    reason: str


class Plan(Model):
    blocks: list[StudyBlock] = Field(default_factory=list)
    shortfalls: list[Shortfall] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


def new_project(today: date) -> Project:
    monday = today - timedelta(days=today.weekday())
    return Project(settings=Settings(semester_start=monday, semester_end=monday + timedelta(days=83), plan_from=today))
