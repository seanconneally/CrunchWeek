import type { CSSProperties } from "react";
import { Hourglass, Settings2, TriangleAlert } from "lucide-react";
import type { PlanResponse, Project, StudyBlock } from "../types";
import { dateLabel, daysBetween, moduleColor } from "../utils";

const weekday = new Intl.DateTimeFormat("en-IE", {
  weekday: "short",
  timeZone: "UTC",
});

export function StudyPlan({
  project,
  result,
  settings,
}: {
  project: Project;
  result: PlanResponse;
  settings: () => void;
}) {
  const groups = result.plan.blocks.reduce<Record<string, StudyBlock[]>>(
    (all, block) => {
      const day = block.start.slice(0, 10);
      (all[day] ??= []).push(block);
      return all;
    },
    {},
  );
  // Days grouped by semester week, so the plan lines up with the Overview strip.
  const weeks = new Map<number, [string, StudyBlock[]][]>();
  for (const entry of Object.entries(groups)) {
    const week =
      Math.floor(daysBetween(project.settings.semester_start, entry[0]) / 7) +
      1;
    weeks.set(week, [...(weeks.get(week) ?? []), entry]);
  }
  const minutes = (blocks: StudyBlock[]) =>
    blocks.reduce((sum, block) => sum + block.minutes, 0);
  return (
    <>
      <section className="panel plan-intro" aria-labelledby="plan-title">
        <div className="panel-head">
          <div>
            <h2 id="plan-title">A plan that fits your week.</h2>
            <p>
              {project.settings.daily_minutes / 60} hours per available day · up
              to {project.settings.block_minutes} minutes per block ·{" "}
              {project.settings.timezone}
            </p>
          </div>
          <button className="button secondary" onClick={settings}>
            <Settings2 size={18} />
            Availability
          </button>
        </div>
        <p className="plan-note">
          Earlier deadlines get priority. Work is placed as late as it fits
          before deadline day, with {project.settings.buffer_days} extra clear
          day(s). Reduce “work left” as you finish; this is a suggested plan,
          not a live timetable.
        </p>
      </section>
      {result.plan.shortfalls.length > 0 && (
        <section className="panel shortfalls" aria-labelledby="short-title">
          <div className="shortfalls-head">
            <Hourglass size={22} aria-hidden="true" />
            <div>
              <h2 id="short-title">Some work still needs room.</h2>
              <p>We haven't squeezed it into hours you don't have.</p>
            </div>
          </div>
          <ul className="shortfall-list">
            {result.plan.shortfalls.map((row) => (
              <li key={row.assessment_id} className="shortfall-row">
                <div>
                  <strong>{row.label}</strong>
                  <small>{row.reason}</small>
                </div>
                <span className="chip warn">
                  {row.minutes / 60}h unscheduled
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {!!result.plan.warnings.length && (
        <details className="notice">
          <summary>
            <TriangleAlert size={18} aria-hidden="true" />
            Planning notes ({result.plan.warnings.length})
          </summary>
          <ul>
            {result.plan.warnings.map((warning, i) => (
              <li key={i}>{warning}</li>
            ))}
          </ul>
        </details>
      )}
      {result.plan.blocks.length > 0 && (
        <div className="panel agenda">
          {[...weeks].map(([week, days]) => {
            const summary = result.weeks.find((row) => row.Week === week);
            const pressure = summary?.Pressure.toLowerCase() ?? "clear";
            return (
              <section
                className={`agenda-week is-${pressure}`}
                key={week}
                aria-labelledby={`agenda-week-${week}`}
              >
                <header className="agenda-week-head">
                  <h3 id={`agenda-week-${week}`}>
                    {week < 1 ? "Before week 1" : `Week ${week}`}
                    {summary && <span>from {dateLabel(summary.Starting)}</span>}
                  </h3>
                  <span className="agenda-hours">
                    {minutes(days.flatMap(([, blocks]) => blocks)) / 60}h
                    planned
                  </span>
                  {!!summary?.Deadlines && (
                    <span className="agenda-pressure">
                      <span className={`key ${pressure}`} aria-hidden="true">
                        {Array.from(
                          { length: Math.min(summary.Deadlines, 4) },
                          (_, i) => (
                            <i key={i} />
                          ),
                        )}
                      </span>
                      {summary.Deadlines} due
                      {summary.Pressure === "Crunch" && ", crunch week"}
                    </span>
                  )}
                </header>
                <ol className="agenda-days">
                  {days.map(([day, blocks]) => (
                    <li className="agenda-day" key={day}>
                      <h4 className="agenda-date">
                        {weekday.format(new Date(`${day}T12:00:00Z`))}{" "}
                        {dateLabel(day, true)}
                        <small>{minutes(blocks) / 60}h total</small>
                      </h4>
                      <ul className="agenda-blocks">
                        {blocks.map((block) => (
                          <li className="study-block" key={block.id}>
                            <span className="time-range">
                              {block.start.slice(11, 16)}–
                              {block.end.slice(11, 16)}
                            </span>
                            <strong>{block.title}</strong>
                            <small>
                              <i
                                className="dot"
                                style={
                                  {
                                    "--module": moduleColor(block.module),
                                  } as CSSProperties
                                }
                              />
                              {block.module}
                            </small>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              </section>
            );
          })}
        </div>
      )}
      {!result.plan.blocks.length && (
        <div className="panel empty-small">
          No study blocks yet. Review dated assessments, set remaining effort
          above zero, and check your available hours.
        </div>
      )}
    </>
  );
}
