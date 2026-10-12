// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import type { Project } from "./types";
import { LIBRARY_KEY, readLibrary, storeProject } from "./storage";

const project = (id: string) =>
  ({
    id,
    name: id,
    assessments: [],
    settings: { semester_start: "2026-10-05", semester_end: "2026-12-27" },
  }) as unknown as Project;
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
describe("durable semester library", () => {
  it("migrates old tab projects and keeps multiple semesters across a new session", () => {
    sessionStorage.setItem(
      "crunch-week-project-v1",
      JSON.stringify(project("old")),
    );
    storeProject(project("new"));
    sessionStorage.clear();
    expect(readLibrary().active).toBe("new");
    expect(Object.keys(readLibrary().projects)).toEqual(["old", "new"]);
    storeProject({ ...project("old"), name: "renamed" });
    expect(Object.keys(readLibrary().projects)).toHaveLength(2);
    expect(readLibrary().projects.old.name).toBe("renamed");
  });
  it("preserves unreadable data before creating a recoverable semester", () => {
    localStorage.setItem(LIBRARY_KEY, "unreadable");
    expect(() => readLibrary()).toThrow();
    storeProject(project("safe"));
    expect(readLibrary().active).toBe("safe");
    const recovery = Object.keys(localStorage).find((key) =>
      key.includes("recovery"),
    );
    expect(localStorage.getItem(recovery!)).toBe("unreadable");
  });
});
