import { expect, it } from "vitest";
import type { Project, StudyActivity } from "./types";
import { weeklyProgress } from "./insights";
const row = (
  state: "done" | "skipped",
  logged_at: string | null,
  start = "2026-10-12T17:00:00+01:00",
) => ({ state, logged_at, start, minutes: 60 }) as StudyActivity;
const project = (history: StudyActivity[]) =>
  ({
    settings: { timezone: "Europe/Dublin" },
    study_history: history,
  }) as Project;
it("attributes completed work to its actual local completion date", () => {
  const result = weeklyProgress(
    project([
      row("done", "2026-10-12T23:30:00Z"),
      row("done", "2026-10-14T12:00:00Z"),
      row("skipped", "2026-10-14T12:00:00Z"),
      row("done", "2026-10-05T12:00:00Z"),
    ]),
    "2026-10-14",
  );
  expect(result.monday).toBe("2026-10-12");
  expect(result.minutes).toEqual([0, 60, 60, 0, 0, 0, 0]);
  expect(result.total).toBe(120);
});
it("supports old activity without an actual completion timestamp", () => {
  expect(weeklyProgress(project([row("done", null)]), "2026-10-18").total).toBe(
    60,
  );
  expect(weeklyProgress(project([row("done", null)]), "2026-10-19").total).toBe(
    0,
  );
});
