import { useState } from "react";
import type { CSSProperties } from "react";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  FileSearch,
  Info,
  TriangleAlert,
} from "lucide-react";
import type { Assessment, PlanResponse, Project, Tab } from "../types";
import {
  addDays,
  dateLabel,
  daysBetween,
  moduleColor,
  monthCells,
  shiftMonth,
  todayIn,
} from "../utils";

/** The semester strip animates in once, until its last step has played. */
let revealed = false;

export function Dashboard({
  project,
  result,
  navigate,
  edit,
}: {
  project: Project;
  result: PlanResponse;
  navigate: (tab: Tab) => void;
  edit: (item: Assessment) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [month, setMonth] = useState(project.settings.plan_from.slice(0, 7));
  const [showStudy, setShowStudy] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [reveal] = useState(() => !revealed);
  const reviewed = project.assessments.filter((item) => item.reviewed);
  const crunch = result.weeks.filter((week) => week.Pressure === "Crunch");
  const remaining = project.assessments.length - reviewed.length;
  const shortfall =
    result.plan.shortfalls.reduce((sum, row) => sum + row.minutes, 0) / 60;
  const peak = [...result.weeks].sort((a, b) => b.Deadlines - a.Deadlines)[0];
  const max = Math.max(4, ...result.weeks.map((week) => week.Deadlines));
  const selectedWeek =
    selected === null
      ? null
      : result.weeks.find((week) => week.Week === selected);
  const upcoming = [...reviewed]
    .filter(
      (item) =>
        item.due_date &&
        item.due_date >= project.settings.plan_from &&
        (!selectedWeek ||
          (item.due_date >= selectedWeek.Starting &&
            item.due_date < addDays(selectedWeek.Starting, 7))),
    )
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))
    .slice(0, 5);
  const monthTitle = new Intl.DateTimeFormat("en-IE", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T12:00:00Z`));
  const dailyItems = selectedDate
    ? reviewed.filter((item) => item.due_date === selectedDate)
    : [];
  const dailyBlocks = selectedDate
    ? result.plan.blocks.filter(
        (block) => block.start.slice(0, 10) === selectedDate,
      )
    : [];

  // Where today falls on the strip, and each deadline's day within its week.
  const { semester_start, semester_end, timezone } = project.settings;
  const lastDay = daysBetween(semester_start, semester_end);
  const today = todayIn(timezone);
  const todayOffset = daysBetween(semester_start, today);
  const currentWeek =
    todayOffset >= 0 && todayOffset <= lastDay
      ? Math.floor(todayOffset / 7) + 1
      : null;
  const isPast = (week: number) =>
    todayOffset > lastDay || (currentWeek !== null && week < currentWeek);
  const emptyWeek = (): Assessment[][] => Array.from({ length: 7 }, () => []);
  const dueDays = new Map<number, Assessment[][]>();
  for (const item of reviewed) {
    if (!item.due_date || item.due_date < semester_start) continue;
    if (item.due_date > semester_end) continue;
    const offset = daysBetween(semester_start, item.due_date);
    const week = Math.floor(offset / 7) + 1;
    const days = dueDays.get(week) ?? emptyWeek();
    days[offset % 7].push(item);
    dueDays.set(week, days);
  }
  const crunchAhead = new Set(
    crunch.filter((week) => !isPast(week.Week)).map((week) => week.Week),
  );
  const weekOf = (day: string) =>
    Math.floor(daysBetween(semester_start, day) / 7) + 1;
  const hours = (value: number) => Math.round(value * 10) / 10;
  const peakIndex = peak ? result.weeks.indexOf(peak) : -1;
  const studyHours =
    result.plan.blocks.reduce((sum, block) => sum + block.minutes, 0) / 60;

  return (
    <>
      <section
        className={`hero ${reveal ? "reveal" : ""}`}
        aria-labelledby="hero-title"
        onAnimationEnd={(event) => {
          if (event.animationName === "note-in") revealed = true;
        }}
      >
        {remaining > 0 && (
          <button
            className="hero-review"
            onClick={() => navigate("assessments")}
          >
            <FileSearch size={18} aria-hidden="true" />
            <span>
              {remaining} assessment{remaining === 1 ? "" : "s"} need review
              before they appear in your plan.
            </span>
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        )}
        <div className="hero-head">
          <div>
            <h2 id="hero-title">Your semester, at a glance.</h2>
            <p className="hero-caption">
              {selectedWeek
                ? `Week ${selectedWeek.Week} selected: ${selectedWeek.Deadlines} deadline${selectedWeek.Deadlines === 1 ? "" : "s"} from ${dateLabel(selectedWeek.Starting)}, about ${hours(selectedWeek["Effort (h)"])} h of work. Select it again to show every week.`
                : `${result.weeks.length} weeks from ${dateLabel(semester_start)} to ${dateLabel(semester_end)}.${currentWeek ? ` You're in week ${currentWeek}.` : ""} Select a week to list its deadlines.`}
            </p>
          </div>
          <ul className="legend" aria-label="Key">
            <li>
              <span className="key clear" />
              Clear
            </li>
            <li>
              <span className="key steady">
                <i />
              </span>
              Steady
            </li>
            <li>
              <span className="key busy">
                <i />
                <i />
              </span>
              Busy
            </li>
            <li>
              <span className="key crunch">
                <i />
                <i />
                <i />
              </span>
              Crunch
            </li>
          </ul>
        </div>
        <div
          className="strip"
          role="group"
          aria-label="Weekly deadline counts"
          data-dense={result.weeks.length > 16 ? "" : undefined}
          style={
            {
              "--cols": result.weeks.length,
              "--max": max,
            } as CSSProperties
          }
        >
          {todayOffset >= 0 && (
            <span
              className={`strip-past ${currentWeek ? "" : "is-over"}`}
              aria-hidden="true"
              style={
                {
                  "--week": currentWeek ? currentWeek - 1 : result.weeks.length,
                  "--day": currentWeek ? todayOffset % 7 : 0,
                } as CSSProperties
              }
            />
          )}
          {result.weeks.map((week, i) => (
            <button
              key={week.Week}
              className={`week ${isPast(week.Week) ? "past" : ""}`}
              data-pressure={week.Pressure.toLowerCase()}
              onClick={() =>
                setSelected(selected === week.Week ? null : week.Week)
              }
              aria-label={`Week ${week.Week}, from ${dateLabel(week.Starting)}: ${week.Deadlines} deadline${week.Deadlines === 1 ? "" : "s"}${week.Pressure === "Crunch" ? ", crunch week" : ""}`}
              aria-pressed={selected === week.Week}
              title={`${dateLabel(week.Starting)} · ${week.Deadlines} deadlines · ${week["Effort (h)"]}h estimated work`}
              style={{ "--i": i } as CSSProperties}
            >
              <span className="week-count" aria-hidden="true">
                {week.Deadlines > 0 && `${week.Deadlines} due`}
              </span>
              <span className="week-stack" aria-hidden="true">
                {Array.from({ length: week.Deadlines }, (_, j) => (
                  <i key={j} style={{ "--j": j } as CSSProperties} />
                ))}
              </span>
              <span className="week-ruler" aria-hidden="true">
                {(dueDays.get(week.Week) ?? emptyWeek()).map((items, day) => (
                  <span key={day}>
                    {items.slice(0, 3).map((item, k) => (
                      <i
                        key={item.id}
                        style={
                          {
                            "--module": moduleColor(item.module),
                            "--k": k,
                          } as CSSProperties
                        }
                      />
                    ))}
                  </span>
                ))}
              </span>
              <span className="week-num" aria-hidden="true">
                {week.Week}
              </span>
              <span className="week-date" aria-hidden="true">
                {dateLabel(week.Starting)}
              </span>
              {week.Week === currentWeek ? (
                <span className="week-today" aria-hidden="true">
                  Today
                </span>
              ) : (
                <span />
              )}
            </button>
          ))}
        </div>
        <div
          className={`crunch-note ${peak?.Deadlines ? "has-peak" : ""} ${peak?.Pressure === "Crunch" && !isPast(peak.Week) ? "is-crunch" : ""}`}
          style={
            {
              "--at": (peakIndex + 0.5) / result.weeks.length,
            } as CSSProperties
          }
        >
          <div>
            <h3>
              {peak?.Deadlines
                ? `Week ${peak.Week} needs a head start.`
                : "A calmer semester starts here."}
            </h3>
            <p>
              {peak?.Deadlines
                ? `${peak.Deadlines} deadlines land from ${dateLabel(peak.Starting)}. Your plan works backwards to make space before the rush.`
                : "Review your assessments to see where the busy weeks land."}
            </p>
            {peak && Object.keys(peak["Module weights"]).length > 0 && (
              <ul
                className="weights"
                aria-label={`Module weights in week ${peak.Week}`}
              >
                {Object.entries(peak["Module weights"]).map(
                  ([module, weight]) => (
                    <li
                      key={module}
                      style={
                        { "--module": moduleColor(module) } as CSSProperties
                      }
                    >
                      <i className="dot" />
                      {module.split(" · ")[0]} <b>{weight}%</b>
                    </li>
                  ),
                )}
              </ul>
            )}
          </div>
          <button className="text-link" onClick={() => navigate("study")}>
            See your study plan
          </button>
        </div>
        <div className="ledger">
          <p>
            <b>{project.assessments.length}</b>
            <span>
              <strong>Assessments</strong> across{" "}
              {new Set(project.assessments.map((item) => item.module)).size}{" "}
              modules
            </span>
          </p>
          <p>
            <b>{crunch.length}</b>
            <span>
              <strong>Crunch weeks</strong> 3+ deadlines in one week
            </span>
          </p>
          <p>
            <b>
              {studyHours}
              <small>h</small>
            </b>
            <span>
              <strong>Study scheduled</strong> {result.plan.blocks.length}{" "}
              manageable blocks
            </span>
          </p>
          <p
            className={
              remaining ? "is-pencil" : shortfall > 0 ? "is-warn" : undefined
            }
          >
            <b>
              {remaining > 0 && <FileSearch size={20} aria-hidden="true" />}
              {!remaining && shortfall > 0 && (
                <TriangleAlert size={20} aria-hidden="true" />
              )}
              {remaining || shortfall}
              {!remaining && <small>h</small>}
            </b>
            <span>
              <strong>
                {remaining ? "Ready for review" : "Unscheduled work"}
              </strong>{" "}
              {remaining
                ? "check the source before planning"
                : shortfall
                  ? "adjust your available hours"
                  : "all estimated work has a place"}
            </span>
          </p>
        </div>
        <p className="hero-footnote">
          Week 1 starts {dateLabel(project.settings.semester_start)}. Break
          weeks are included; confirm your university's teaching-week dates.
        </p>
      </section>
      <div className="overview-lower">
        <section className="panel calendar" aria-labelledby="calendar-title">
          <div className="calendar-head">
            <h2 id="calendar-title">{monthTitle}</h2>
            <div className="calendar-nav">
              <button
                className="icon-button"
                aria-label="Previous month"
                onClick={() => {
                  setMonth(shiftMonth(month, -1));
                  setSelectedDate(null);
                }}
              >
                <ChevronLeft size={20} />
              </button>
              <button
                className="icon-button"
                aria-label="Next month"
                onClick={() => {
                  setMonth(shiftMonth(month, 1));
                  setSelectedDate(null);
                }}
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={showStudy}
              onChange={(e) => setShowStudy(e.target.checked)}
            />
            Include study blocks
          </label>
          <div className="calendar-grid">
            {["M", "T", "W", "T", "F", "S", "S"].map((day, i) => (
              <div className="calendar-weekday" key={i} aria-hidden="true">
                {day}
              </div>
            ))}
            {monthCells(month).map((day, i) => {
              const items = reviewed.filter(
                (item) => day && item.due_date === day,
              );
              const blocks = showStudy
                ? result.plan.blocks.filter(
                    (block) => day && block.start.slice(0, 10) === day,
                  )
                : [];
              const inCrunch =
                !!day &&
                day >= semester_start &&
                day <= semester_end &&
                crunchAhead.has(weekOf(day));
              return day ? (
                <button
                  key={day}
                  className={`calendar-day ${selectedDate === day ? "chosen" : ""} ${items.length >= 2 ? "crowded" : ""} ${inCrunch ? "in-crunch" : ""}`}
                  onClick={() => setSelectedDate(day)}
                  aria-label={`${dateLabel(day)}: ${items.length} deadlines, ${blocks.length} study blocks${inCrunch ? ", crunch week" : ""}`}
                  aria-current={day === today ? "date" : undefined}
                >
                  <span>{Number(day.slice(-2))}</span>
                  <span className="calendar-dots">
                    {items.slice(0, 3).map((item) => (
                      <i
                        className="dot"
                        key={item.id}
                        style={
                          {
                            "--module": moduleColor(item.module),
                          } as CSSProperties
                        }
                      />
                    ))}
                    {blocks.length > 0 && <i className="dot study-dot" />}
                  </span>
                </button>
              ) : (
                <div key={`blank-${i}`} />
              );
            })}
          </div>
          {selectedDate && (
            <div className="day-detail">
              <strong>{dateLabel(selectedDate, true)}</strong>
              {dailyItems.map((item) => (
                <button
                  className="day-item"
                  key={item.id}
                  onClick={() => edit(item)}
                >
                  <i
                    className="dot"
                    style={
                      { "--module": moduleColor(item.module) } as CSSProperties
                    }
                  />
                  <span>
                    {item.due_time?.slice(0, 5) || "All day"} · {item.title}
                  </span>
                </button>
              ))}
              {showStudy &&
                dailyBlocks.map((block) => (
                  <div className="day-study" key={block.id}>
                    <i className="dot study-dot" />
                    <span>
                      {block.start.slice(11, 16)} · Study: {block.title}
                    </span>
                  </div>
                ))}
              {!dailyItems.length && (!showStudy || !dailyBlocks.length) && (
                <p className="muted small">Nothing scheduled.</p>
              )}
            </div>
          )}
        </section>
        <section className="panel next-up" aria-labelledby="next-up-title">
          <div className="panel-head">
            <h2 id="next-up-title">
              {selectedWeek
                ? `Week ${selectedWeek.Week} deadlines`
                : "Coming up next"}
            </h2>
            <button
              className="text-link"
              onClick={() => navigate("assessments")}
            >
              View all
            </button>
          </div>
          {upcoming.length ? (
            <ol className="deadlines">
              {upcoming.map((item) => (
                <li key={item.id}>
                  <button
                    className={`deadline ${item.due_date && crunchAhead.has(weekOf(item.due_date)) ? "in-crunch" : ""}`}
                    onClick={() => edit(item)}
                  >
                    <span className="deadline-date">
                      <b>{Number(item.due_date?.slice(-2))}</b>
                      <small>
                        {dateLabel(item.due_date).split(" ").slice(1).join(" ")}
                      </small>
                    </span>
                    <span className="deadline-info">
                      <strong>{item.title}</strong>
                      <small>
                        <i
                          className="dot"
                          style={
                            {
                              "--module": moduleColor(item.module),
                            } as CSSProperties
                          }
                        />
                        {item.module}
                      </small>
                    </span>
                    <span className="deadline-weight">
                      {item.weight_percent === null
                        ? "—"
                        : `${item.weight_percent}%`}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="empty-small">No reviewed deadlines in this window.</p>
          )}
          <p className="tip">
            <Info size={18} aria-hidden="true" />
            Percentages belong to each module. Your plan uses estimated hours to
            balance the work.
          </p>
        </section>
      </div>
    </>
  );
}
