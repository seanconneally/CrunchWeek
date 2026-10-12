"""Persistent daily budget for the single-operator local application."""

import sqlite3
from contextlib import closing
from datetime import datetime, time, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from crunch_week.models import Model

LIMIT = 25
ZONE = ZoneInfo("Europe/Dublin")


class ChatUsage(Model):
    limit: int
    used: int
    remaining: int
    reset_at: datetime
    timezone: str = "Europe/Dublin"


class DailyLimitError(ValueError):
    pass


class DailyChatBudget:
    def __init__(self, path: Path):
        self.path = path

    def _connect(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(self.path, timeout=10, isolation_level=None)
        db.execute("CREATE TABLE IF NOT EXISTS daily_usage (day TEXT PRIMARY KEY, used INTEGER NOT NULL)")
        return db

    def _result(self, now: datetime, used: int) -> ChatUsage:
        tomorrow = now.astimezone(ZONE).date() + timedelta(days=1)
        return ChatUsage(
            limit=LIMIT, used=used, remaining=max(0, LIMIT - used), reset_at=datetime.combine(tomorrow, time(), ZONE)
        )

    def status(self, now: datetime) -> ChatUsage:
        with closing(self._connect()) as db:
            row = db.execute("SELECT used FROM daily_usage WHERE day=?", (str(now.astimezone(ZONE).date()),)).fetchone()
        return self._result(now, row[0] if row else 0)

    def reserve(self, now: datetime) -> ChatUsage:
        day = str(now.astimezone(ZONE).date())
        with closing(self._connect()) as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT used FROM daily_usage WHERE day=?", (day,)).fetchone()
            used = row[0] if row else 0
            if used >= LIMIT:
                db.rollback()
                raise DailyLimitError(
                    "You have used today's 25 chat messages. Chat resets at midnight in Europe/Dublin. Direct app edits remain available."
                )
            db.execute(
                "INSERT INTO daily_usage(day,used) VALUES (?,?) ON CONFLICT(day) DO UPDATE SET used=excluded.used",
                (day, used + 1),
            )
            db.execute("DELETE FROM daily_usage WHERE day < ?", (str(now.astimezone(ZONE).date() - timedelta(days=7)),))
            db.commit()
        return self._result(now, used + 1)
