// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest";
import type { FocusSession } from "./focus";
import { FOCUS_KEY, focusElapsed, readFocus } from "./focus";

const session = (): FocusSession => ({
  project_id: "semester",
  planned_at: "2026-10-12T12:00:00Z",
  block: {
    id: "block",
    assessment_id: "assessment",
    module: "CS",
    title: "Essay",
    start: "2026-10-12T17:00:00+01:00",
    end: "2026-10-12T18:00:00+01:00",
    minutes: 60,
  },
  elapsed_ms: 60000,
  started_at: 100000,
});
beforeEach(() => localStorage.clear());
it("uses elapsed wall-clock time after sleeping or restoring a tab", () => {
  expect(focusElapsed(session(), 220000)).toBe(180000);
  expect(focusElapsed(session(), 99999999)).toBe(3600000);
  expect(focusElapsed(session(), 0)).toBe(60000);
});
it("does not advance a paused session", () => {
  expect(focusElapsed({ ...session(), started_at: null }, 99999999)).toBe(
    60000,
  );
});
it("restores the original semester and scheduling snapshot", () => {
  localStorage.setItem(FOCUS_KEY, JSON.stringify(session()));
  expect(readFocus()).toEqual(session());
});
it("rejects corrupted, unbounded and negative timer data", () => {
  for (const value of [
    "bad",
    JSON.stringify({ ...session(), elapsed_ms: -1 }),
    JSON.stringify({
      ...session(),
      block: { ...session().block, minutes: 10000 },
    }),
  ]) {
    localStorage.setItem(FOCUS_KEY, value);
    expect(readFocus()).toBeNull();
  }
});
