import { describe, expect, it } from "vitest";
import type { Project } from "./types";
import { estimateSuggestion, loggedMinutes } from "./estimates";
function sample(minutes: number[], module = "CS", id = "history"): Project {
  return {
    id,
    demo: false,
    assessments: minutes.map((_, i) => ({
      id: `a${i}`,
      module,
      kind: "Assignment",
      effort_minutes: 0,
      completed: false,
    })),
    study_history: minutes.map((n, i) => ({
      id: `l${i}`,
      assessment_id: `a${i}`,
      state: "done",
      minutes: n,
      feedback: "finished",
      start: `2026-10-${10 + i}T17:00:00Z`,
      logged_at: `2026-10-${10 + i}T19:00:00Z`,
    })),
  } as unknown as Project;
}
describe("personal remaining-work suggestions", () => {
  it("needs three completed examples and uses a rounded median rather than an outlier", () => {
    expect(
      estimateSuggestion(
        [sample([120, 180])],
        "Assignment",
        "CS",
        "new",
        "new",
      ),
    ).toBeNull();
    expect(
      estimateSuggestion(
        [sample([120, 180, 1200])],
        "Assignment",
        "CS",
        "new",
        "new",
      ),
    ).toEqual({ minutes: 180, samples: 3, sameModule: true });
  });
  it("excludes demo, unfinished and other assessment types", () => {
    const history = sample([120, 180, 240, 300, 360]);
    history.assessments[0].kind = "Exam";
    history.study_history[1].feedback = "on_track";
    history.assessments[2].effort_minutes = 30;
    expect(
      estimateSuggestion(
        [history, { ...sample([90, 90, 90]), id: "demo", demo: true }],
        "Assignment",
        "CS",
        "new",
        "new",
      ),
    ).toBeNull();
  });
  it("deduplicates semesters and excludes the assessment being edited", () => {
    const history = sample([120, 180, 240]);
    expect(
      estimateSuggestion(
        [history, history],
        "Assignment",
        "CS",
        "history",
        "a0",
      ),
    ).toBeNull();
  });
  it("prefers the same module only when three examples exist", () => {
    const cs = sample([60, 90, 120], "CS", "cs"),
      maths = sample([600, 630, 660], "MA", "maths");
    expect(
      estimateSuggestion([cs, maths], "Assignment", "CS", "new", "new")
        ?.minutes,
    ).toBe(90);
    expect(
      estimateSuggestion(
        [sample([60, 90], "CS", "cs"), maths],
        "Assignment",
        "CS",
        "new",
        "new",
      ),
    ).toEqual({ minutes: 600, samples: 5, sameModule: false });
  });
  it("counts actual completed logs, excluding moved/undone work", () => {
    const history = sample([120, 180, 240]);
    history.study_history[0].state = "skipped";
    expect(loggedMinutes(history, history.assessments[0])).toBe(0);
    expect(
      estimateSuggestion([history], "Assignment", "CS", "new", "new"),
    ).toBeNull();
  });
});
