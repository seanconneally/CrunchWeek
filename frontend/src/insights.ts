import type { Project } from "./types";
import { addDays, daysBetween } from "./utils";

export function weeklyProgress(project: Project, today: string) {
  const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  const monday = addDays(today, -weekday);
  const minutes = Array<number>(7).fill(0);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: project.settings.timezone,
  });
  for (const row of project.study_history) {
    if (row.state !== "done") continue;
    const day = row.logged_at
      ? formatter.format(new Date(row.logged_at))
      : row.start.slice(0, 10);
    const offset = daysBetween(monday, day);
    if (offset >= 0 && offset < 7) minutes[offset] += row.minutes;
  }
  return { monday, minutes, total: minutes.reduce((sum, n) => sum + n, 0) };
}
