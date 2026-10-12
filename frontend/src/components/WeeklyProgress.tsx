import type { Project } from "../types";
import { weeklyProgress } from "../insights";
import { dateLabel, todayIn } from "../utils";
export function WeeklyProgress({
  project,
  settings,
}: {
  project: Project;
  settings: () => void;
}) {
  const { monday, minutes, total } = weeklyProgress(
    project,
    todayIn(project.settings.timezone),
  );
  const goal = project.settings.weekly_goal_minutes;
  const max = Math.max(60, ...minutes);
  return (
    <section
      className="panel weekly-progress"
      aria-labelledby="weekly-goal-title"
    >
      <div className="weekly-goal-copy">
        <div className="panel-head">
          <h2 id="weekly-goal-title">Your week in progress</h2>
          <button className="text-link" onClick={settings}>
            Edit goal
          </button>
        </div>
        <p>
          <strong>
            {total / 60} / {goal / 60} hours
          </strong>{" "}
          logged this week
        </p>
        <progress
          className="work-progress"
          value={Math.min(total, goal)}
          max={goal}
          aria-label="Weekly study goal"
        />
        <p className="muted small">
          {total >= goal
            ? "Your weekly goal is reached. Make room for a break."
            : `${(goal - total) / 60} hours to your goal. Every completed session counts.`}{" "}
          Week of {dateLabel(monday)}.
        </p>
      </div>
      <div
        className="week-progress-bars"
        role="group"
        aria-label="Completed study by weekday"
      >
        {minutes.map((value, i) => (
          <div
            key={i}
            aria-label={`${["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][i]}: ${value} minutes completed`}
          >
            <span>{value ? `${value / 60}h` : ""}</span>
            <div className="week-progress-track">
              <i
                style={{
                  height: `${(value / max) * 100}%`,
                  minHeight: value ? "2px" : "0",
                }}
              />
            </div>
            <small>{["M", "T", "W", "T", "F", "S", "S"][i]}</small>
          </div>
        ))}
      </div>
    </section>
  );
}
