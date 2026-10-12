"""Validated domain objects shared by the UI, planner and integrations."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from datetime import date as CalendarDate
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


class Task(Model):
    id: UUID = Field(default_factory=uuid4)
    title: str = Field(min_length=1, max_length=160)
    done: bool = False


class StudyWindow(Model):
    weekday: int = Field(ge=0, le=6)
    start: time
    minutes: int = Field(ge=30, le=480, multiple_of=30)

    @model_validator(mode="after")
    def valid_hours(self) -> StudyWindow:
        if self.start.tzinfo or self.start.second or self.start.microsecond or self.start.minute % 30:
            raise ValueError("Study start must be on the hour or half hour, without a timezone.")
        if self.start.hour * 60 + self.start.minute + self.minutes >= 1440:
            raise ValueError("Each study window must finish before midnight.")
        return self


class Commitment(Model):
    id: UUID = Field(default_factory=uuid4)
    title: str = Field(min_length=1, max_length=100)
    date: CalendarDate | None = None
    weekday: int = Field(ge=0, le=6)
    start: time
    end: time

    @model_validator(mode="after")
    def valid_hours(self) -> Commitment:
        for clock in (self.start, self.end):
            if clock.tzinfo or clock.second or clock.microsecond:
                raise ValueError("Commitments use local HH:MM times.")
        if self.end <= self.start:
            raise ValueError("Commitments must finish after they start on the same day.")
        return self


class ExtraWindow(Model):
    date: CalendarDate
    start: time
    minutes: int = Field(ge=30, le=480, multiple_of=30)

    @model_validator(mode="after")
    def valid_hours(self) -> ExtraWindow:
        StudyWindow(weekday=self.date.weekday(), start=self.start, minutes=self.minutes)
        return self


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
    source_page: int | None = Field(default=None, ge=1, le=150)
    evidence: str = Field(default="", max_length=1500)
    notes: str = Field(default="", max_length=2000)
    reviewed: bool = False
    completed: bool = False
    tasks: list[Task] = Field(default_factory=list, max_length=30)

    @field_validator("due_time")
    @classmethod
    def wall_time_only(cls, value: time | None) -> time | None:
        if value and (value.tzinfo is not None or value.second or value.microsecond):
            raise ValueError("Use a local HH:MM time, without seconds or a timezone offset.")
        return value

    @model_validator(mode="after")
    def time_needs_date(self) -> Assessment:
        ids = [task.id for task in self.tasks]
        if len(ids) != len(set(ids)):
            raise ValueError("Checklist task IDs must be unique.")
        if self.due_time and not self.due_date:
            raise ValueError("A deadline time needs a deadline date.")
        return self


class Settings(Model):
    semester_start: date
    semester_end: date
    plan_from: date
    availability_confirmed: bool = False
    timezone: str = "Europe/Dublin"
    weekdays: list[int] = Field(default_factory=lambda: [0, 1, 2, 3, 4], min_length=1, max_length=7)
    day_start: time = time(17)
    daily_minutes: int = Field(default=180, ge=30, le=480, multiple_of=30)
    block_minutes: Literal[30, 60, 90, 120] = 60
    reminder_minutes: Literal[0, 5, 10, 15, 30, 60] = 10
    deadline_reminder_days: Literal[0, 1, 2, 7] = 1
    weekly_goal_minutes: int = Field(default=300, ge=30, le=3360, multiple_of=30)
    weekly_windows: list[StudyWindow] = Field(default_factory=list, max_length=7)
    commitments: list[Commitment] = Field(default_factory=list, max_length=50)
    extra_windows: list[ExtraWindow] = Field(default_factory=list, max_length=90)
    planning_style: Literal["steady", "deadline"] = "steady"
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
        ids = [row.id for row in self.commitments]
        if len(ids) != len(set(ids)):
            raise ValueError("Commitment IDs must be unique.")
        for row in self.commitments:
            if row.date and not self.semester_start <= row.date <= self.semester_end:
                raise ValueError("One-off commitments must fall within the semester.")
        for row in self.extra_windows:
            if not self.semester_start <= row.date <= self.semester_end:
                raise ValueError("One-off study time must fall within the semester.")
        days = [window.weekday for window in self.weekly_windows]
        if len(days) != len(set(days)):
            raise ValueError("Choose one study window per weekday.")
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


class StudyActivity(Model):
    id: UUID
    assessment_id: UUID
    module: str = Field(min_length=1, max_length=120)
    title: str = Field(min_length=1, max_length=200)
    start: datetime
    end: datetime
    minutes: int = Field(ge=30, le=120, multiple_of=30)
    state: Literal["done", "skipped"]
    logged_at: datetime | None = None
    remaining_before: int | None = Field(default=None, ge=0, le=12000, multiple_of=30)
    feedback: Literal["on_track", "need_more_time", "finished"] | None = None
    feedback_previous_remaining: int | None = Field(default=None, ge=0, le=12000, multiple_of=30)
    reported_remaining: int | None = Field(default=None, ge=0, le=12000, multiple_of=30)

    @model_validator(mode="after")
    def valid_interval(self) -> StudyActivity:
        if self.feedback is not None:
            if self.state != "done" or self.feedback_previous_remaining is None or self.reported_remaining is None:
                raise ValueError("A progress check needs a completed session and remaining-work values.")
            if self.feedback == "on_track" and self.reported_remaining != self.feedback_previous_remaining:
                raise ValueError("On-track feedback preserves the remaining estimate.")
            if self.feedback == "need_more_time" and self.reported_remaining <= self.feedback_previous_remaining:
                raise ValueError("Need-more-time feedback increases the remaining estimate.")
            if self.feedback == "finished" and self.reported_remaining != 0:
                raise ValueError("Finished study work must have zero remaining effort.")
        elif self.feedback_previous_remaining is not None or self.reported_remaining is not None:
            raise ValueError("Remaining-work feedback needs a progress-check status.")
        if self.logged_at is not None and self.logged_at.tzinfo is None:
            raise ValueError("Logged activity time must include a timezone.")
        if self.start.tzinfo is None or self.end.tzinfo is None:
            raise ValueError("Study activity times must include a timezone.")
        duration = (self.end.astimezone(timezone.utc) - self.start.astimezone(timezone.utc)).total_seconds()
        if duration != self.minutes * 60 or self.start.minute % 30 or self.start.second or self.start.microsecond:
            raise ValueError("Study activity must match its half-hour time slots.")
        return self


class Project(Model):
    version: Literal[1] = 1
    id: UUID = Field(default_factory=uuid4)
    name: str = Field(default="My semester", min_length=1, max_length=100)
    settings: Settings
    assessments: list[Assessment] = Field(default_factory=list, max_length=300)
    notion: NotionTarget | None = None
    demo: bool = False
    study_history: list[StudyActivity] = Field(default_factory=list, max_length=2000)

    @model_validator(mode="after")
    def distinct_ids(self) -> Project:
        ids = [item.id for item in self.assessments]
        if len(ids) != len(set(ids)):
            raise ValueError("Assessment IDs must be unique.")
        activity_ids = [item.id for item in self.study_history]
        if len(activity_ids) != len(set(activity_ids)):
            raise ValueError("Study activity IDs must be unique.")
        occupied = set()
        for entry in self.study_history:
            for offset in range(0, entry.minutes, 30):
                stamp = entry.start.astimezone(timezone.utc) + timedelta(minutes=offset)
                if stamp in occupied:
                    raise ValueError("Study activities must not overlap.")
                occupied.add(stamp)
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
