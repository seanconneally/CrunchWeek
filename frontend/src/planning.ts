import type { Project } from "./types";
export function planningKey(project: Project) {
  return JSON.stringify({
    id: project.id,
    settings: project.settings,
    assessments: project.assessments.map(
      ({
        id,
        module,
        title,
        kind,
        reviewed,
        completed,
        effort_minutes,
        due_date,
        due_time,
        weight_percent,
      }) => ({
        id,
        module,
        title,
        kind,
        reviewed,
        completed,
        effort_minutes,
        due_date,
        due_time,
        weight_percent,
      }),
    ),
    history: project.study_history.map(
      ({ id, assessment_id, module, title, start, end, minutes, state }) => ({
        id,
        assessment_id,
        module,
        title,
        start,
        end,
        minutes,
        state,
      }),
    ),
  });
}
export function assistantKey(project: Project) {
  return JSON.stringify({
    plan: planningKey(project),
    history: project.study_history,
  });
}
