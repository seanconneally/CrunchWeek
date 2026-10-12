import { CalendarClock } from "lucide-react";
import type { Project } from "../types";
import { addDays, dateLabel, todayIn } from "../utils";
export function UpcomingCommitments({
  project,
  edit,
}: {
  project: Project;
  edit: () => void;
}) {
  const today = todayIn(project.settings.timezone);
  const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone: project.settings.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
  const rows = Array.from({ length: 7 }, (_, i) => addDays(today, i))
    .filter(
      (day) =>
        day >= project.settings.semester_start &&
        day <= project.settings.semester_end,
    )
    .flatMap((day) => {
      const weekday = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
      return project.settings.commitments
        .filter(
          (row) =>
            (row.date ? row.date === day : row.weekday === weekday) &&
            (day !== today || row.end.slice(0, 5) > clock),
        )
        .map((row) => ({ ...row, day }));
    })
    .sort(
      (a, b) => a.day.localeCompare(b.day) || a.start.localeCompare(b.start),
    );
  if (!rows.length) return null;
  return (
    <section
      className="panel upcoming-commitments"
      aria-labelledby="commitments-title"
    >
      <div className="panel-head">
        <div>
          <h2 id="commitments-title">Time for your life</h2>
          <p>Your plan protects these commitments over the next 7 days.</p>
        </div>
        <button className="text-link" onClick={edit}>
          Manage commitments
        </button>
      </div>
      <ul>
        {rows.slice(0, 6).map((row) => (
          <li key={`${row.id}-${row.day}`}>
            <CalendarClock size={18} />
            <div>
              <strong>{row.title}</strong>
              <small>
                {dateLabel(row.day, true)} · {row.start.slice(0, 5)}–
                {row.end.slice(0, 5)} · {row.date ? "one-off" : "weekly"}
              </small>
            </div>
          </li>
        ))}
      </ul>
      {rows.length > 6 && (
        <p className="small muted">
          And {rows.length - 6} more this week. Open Manage commitments to see
          your full schedule.
        </p>
      )}
    </section>
  );
}
