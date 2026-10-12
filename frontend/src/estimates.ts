import type { Assessment, AssessmentKind, Project } from "./types";
export interface EstimateSuggestion {
  minutes: number;
  samples: number;
  sameModule: boolean;
}
export function estimateSuggestion(
  projects: Project[],
  kind: AssessmentKind,
  module: string,
  excludeProject: string,
  excludeAssessment: string,
): EstimateSuggestion | null {
  const samples: { module: string; minutes: number; completed: string }[] = [];
  const unique = new Map(projects.map((project) => [project.id, project]));
  for (const project of unique.values()) {
    if (project.demo) continue;
    for (const item of project.assessments) {
      if (
        item.kind !== kind ||
        item.effort_minutes !== 0 ||
        (project.id === excludeProject && item.id === excludeAssessment)
      )
        continue;
      const logs = project.study_history.filter(
        (row) => row.assessment_id === item.id && row.state === "done",
      );
      if (
        !logs.length ||
        (!item.completed && logs.at(-1)?.feedback !== "finished")
      )
        continue;
      const minutes = logs.reduce((sum, row) => sum + row.minutes, 0);
      if (minutes < 30 || minutes > 12000) continue;
      samples.push({
        module: item.module.trim().toLowerCase(),
        minutes,
        completed: logs.at(-1)!.logged_at || logs.at(-1)!.start,
      });
    }
  }
  const sameModule = samples.filter(
    (row) => row.module === module.trim().toLowerCase(),
  );
  const selected = (sameModule.length >= 3 ? sameModule : samples)
    .sort((a, b) => b.completed.localeCompare(a.completed))
    .slice(0, 20);
  if (selected.length < 3) return null;
  const minutes = selected.map((row) => row.minutes).sort((a, b) => a - b);
  const middle = Math.floor(minutes.length / 2);
  const median =
    minutes.length % 2
      ? minutes[middle]
      : (minutes[middle - 1] + minutes[middle]) / 2;
  return {
    minutes: Math.max(30, Math.round(median / 30) * 30),
    samples: selected.length,
    sameModule: sameModule.length >= 3,
  };
}
export function loggedMinutes(project: Project, item: Assessment) {
  return project.study_history
    .filter((row) => row.assessment_id === item.id && row.state === "done")
    .reduce((sum, row) => sum + row.minutes, 0);
}
