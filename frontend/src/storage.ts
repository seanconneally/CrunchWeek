import type { Project } from "./types";

export const LIBRARY_KEY = "crunch-week-library-v1";
const LEGACY_KEY = "crunch-week-project-v1";
export interface Library {
  active: string;
  projects: Record<string, Project>;
}
export function readLibrary(): Library {
  const raw = localStorage.getItem(LIBRARY_KEY);
  if (raw) {
    const parsed = JSON.parse(raw) as Library;
    if (
      !parsed ||
      typeof parsed.active !== "string" ||
      !parsed.projects ||
      typeof parsed.projects !== "object" ||
      Array.isArray(parsed.projects)
    ) {
      throw new Error(
        "Your saved semesters could not be read. Restore a downloaded backup.",
      );
    }
    for (const [id, row] of Object.entries(parsed.projects)) {
      if (
        !row ||
        row.id !== id ||
        typeof row.name !== "string" ||
        !Array.isArray(row.assessments) ||
        !row.settings ||
        typeof row.settings.semester_start !== "string" ||
        typeof row.settings.semester_end !== "string"
      ) {
        throw new Error(
          "Your saved semesters contain unreadable project data. Restore a downloaded backup.",
        );
      }
    }
    return parsed;
  }
  const legacy = sessionStorage.getItem(LEGACY_KEY);
  if (legacy) {
    const project = JSON.parse(legacy) as Project;
    return { active: project.id, projects: { [project.id]: project } };
  }
  return { active: "", projects: {} };
}
export function storeProject(project: Project): Library {
  let library: Library;
  try {
    library = readLibrary();
  } catch {
    // Preserve unreadable data rather than silently discard a student's work.
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (raw) localStorage.setItem(`${LIBRARY_KEY}-recovery-${Date.now()}`, raw);
    library = { active: "", projects: {} };
  }
  const next = {
    active: project.id,
    projects: { ...library.projects, [project.id]: project },
  };
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(next));
  return next;
}
