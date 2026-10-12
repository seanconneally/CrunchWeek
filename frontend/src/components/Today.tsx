import {
  ArrowRight,
  CalendarClock,
  Clock3,
  Sparkles,
  Timer,
  CircleCheck,
  RefreshCw,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import type {
  Assessment,
  PlanResponse,
  Project,
  StudyAction,
  StudyBlock,
  Tab,
} from "../types";
import { addDays, dateLabel, daysBetween, todayIn } from "../utils";
import { UpcomingCommitments } from "./UpcomingCommitments";
import { WeeklyProgress } from "./WeeklyProgress";
import { StudyActions } from "./StudyActions";

const hours = (minutes: number) =>
  new Intl.NumberFormat("en-IE", { maximumFractionDigits: 1 }).format(
    minutes / 60,
  );
export function Today({
  project,
  result,
  busy,
  action,
  navigate,
  edit,
  submit,
  refresh,
  settings,
  recover,
  commitments,
  chat,
  focus,
  toggleTask,
  checkProgress,
}: {
  project: Project;
  result: PlanResponse;
  busy: boolean;
  action: (action: StudyAction, id: string) => void;
  navigate: (tab: Tab) => void;
  edit: (item: Assessment) => void;
  submit: (item: Assessment) => void;
  refresh: () => void;
  settings: () => void;
  recover: () => void;
  commitments: () => void;
  chat: () => void;
  focus: (block: StudyBlock) => void;
  checkProgress: (id: string) => void;
  toggleTask: (assessment: string, task: string) => void;
}) {
  const today = todayIn(project.settings.timezone);
  const pending = project.assessments.filter((item) => !item.completed);
  const review = pending.filter((item) => !item.reviewed || !item.due_date);
  const done = project.study_history.filter((row) => row.state === "done");
  const doneMinutes = done.reduce((sum, row) => sum + row.minutes, 0);
  const remainingMinutes = pending.reduce(
    (sum, item) => sum + item.effort_minutes,
    0,
  );
  const todayBlocks = result.plan.blocks.filter(
    (block) => block.start.slice(0, 10) === today,
  );
  const displayBlocks = todayBlocks.length
    ? todayBlocks
    : result.plan.blocks.slice(0, 3);
  const confirmed = pending
    .filter((item) => item.reviewed && item.due_date)
    .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));
  const urgent = confirmed.filter(
    (item) => item.due_date! <= addDays(today, 7),
  );
  const deadlines = urgent.length ? urgent.slice(0, 6) : confirmed.slice(0, 3);
  const shortfall = result.plan.shortfalls.reduce(
    (sum, item) => sum + item.minutes,
    0,
  );
  const percent =
    doneMinutes + remainingMinutes
      ? Math.round((doneMinutes / (doneMinutes + remainingMinutes)) * 100)
      : 0;
  const recent = [...project.study_history].reverse().slice(0, 5);
  const submitted = project.assessments.filter((item) => item.completed).length;
  const nextBlock = displayBlocks[0];
  const hoursConfirmed =
    project.demo || !!project.settings.availability_confirmed;
  const needsReview = !nextBlock && review.length > 0;
  const setupSteps = [
    {
      title: "Add assessments",
      copy: `${project.assessments.length} added`,
      done: project.assessments.length > 0,
      run: () => navigate("assessments"),
    },
    {
      title: "Check deadlines",
      copy: review.length
        ? `${review.length} still need checking`
        : "Dates and sources checked",
      done: review.length === 0,
      run: () => (review.length ? edit(review[0]) : navigate("assessments")),
    },
    {
      title: "Set study hours",
      copy: hoursConfirmed
        ? "Your hours confirmed"
        : "The plan is using default hours",
      done: hoursConfirmed,
      run: settings,
    },
  ];
  const setupDone = setupSteps.filter((step) => step.done).length;
  const nextAction = !hoursConfirmed
    ? "Confirm the hours you are actually free."
    : needsReview
      ? "Check your deadlines to build a study plan."
      : shortfall
        ? `${hours(shortfall)} hours of work will not fit before the deadlines.`
        : nextBlock
          ? `${nextBlock.module} · ${nextBlock.title}`
          : remainingMinutes
            ? "Some work still needs a place in your schedule."
            : pending.length
              ? "Study work is finished. Check what still needs submitting."
              : "Your assessments are submitted.";
  const actionDetail = !hoursConfirmed
    ? "Check the default study hours and protect your work, training and lectures before relying on this plan."
    : needsReview
      ? "Unconfirmed deadlines stay out of the plan. Open an assessment, check its source and confirm its date."
      : shortfall
        ? "Review ways to make room. You choose which changes to apply."
        : nextBlock
          ? `Scheduled ${nextBlock.start.slice(0, 10) === today ? "today" : dateLabel(nextBlock.start)} at ${new Intl.DateTimeFormat("en-IE", { hour: "2-digit", minute: "2-digit", timeZone: project.settings.timezone }).format(new Date(nextBlock.start))} · ${nextBlock.minutes} minutes. Start the timer when you are ready; log only time you actually study.`
          : remainingMinutes
            ? "Check your semester dates, available hours and deadline warnings in Study plan."
            : pending.length
              ? "Finishing study time does not mark an assessment as submitted. Confirm each submission below."
              : "Add another assessment when you have one. Your recorded progress is saved.";
  return (
    <>
      {!project.demo && setupDone < 3 && (
        <section className="setup-guide panel" aria-labelledby="setup-title">
          <div className="setup-heading">
            <h2 id="setup-title">Make this plan yours</h2>
            <span>{setupDone} of 3 steps complete</span>
          </div>
          <ol>
            {setupSteps.map((step, index) => (
              <li key={step.title}>
                <button disabled={busy} onClick={step.run}>
                  <span
                    className={`setup-number ${step.done ? "done" : ""}`}
                    aria-hidden="true"
                  >
                    {step.done ? <CircleCheck size={18} /> : index + 1}
                  </span>
                  <span>
                    <strong>{step.title}</strong>
                    <small>{step.copy}</small>
                  </span>
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}
      <section className="today-overview" aria-labelledby="today-title">
        <div className="today-hero panel">
          <div className="today-hero-copy">
            <div className="today-kicker">
              {dateLabel(today, true)} · {project.settings.timezone}
            </div>
            <div className="panel-head">
              <div>
                <span className="next-action-label">YOUR NEXT STEP</span>
                <h2 id="today-title">{nextAction}</h2>
                <p>{actionDetail}</p>
              </div>
              <div className="plan-buttons">
                {!hoursConfirmed ? (
                  <button
                    className="button hero-focus"
                    disabled={busy}
                    onClick={settings}
                  >
                    Confirm study hours
                  </button>
                ) : needsReview ? (
                  <button
                    className="button hero-focus"
                    disabled={busy}
                    onClick={() => edit(review[0])}
                  >
                    Check an assessment
                  </button>
                ) : shortfall ? (
                  <button
                    className="button hero-focus"
                    disabled={busy}
                    onClick={recover}
                  >
                    Fix the study plan
                  </button>
                ) : nextBlock ? (
                  <button
                    className="button hero-focus"
                    disabled={busy}
                    onClick={() => focus(nextBlock)}
                  >
                    <Timer size={16} aria-hidden="true" />
                    Start next session
                  </button>
                ) : remainingMinutes ? (
                  <button
                    className="button hero-focus"
                    onClick={() => navigate("study")}
                  >
                    Check study plan
                  </button>
                ) : null}
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={chat}
                >
                  Add training with chat
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={commitments}
                >
                  Add work or training
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={refresh}
                >
                  <RefreshCw size={16} />
                  Rebuild from now
                </button>
              </div>
            </div>
          </div>
          <div className="hero-orbit" aria-hidden="true">
            <span className="orbit-spark">
              <Sparkles size={20} />
            </span>
            <svg viewBox="0 0 140 140">
              <circle className="orbit-track" cx="70" cy="70" r="58" />
              <circle
                className="orbit-value"
                cx="70"
                cy="70"
                r="58"
                pathLength="100"
                strokeOpacity={percent ? 1 : 0}
                strokeDasharray={`${percent} 100`}
                transform="rotate(-90 70 70)"
              />
            </svg>
            <div className="orbit-caption">
              <b>
                {percent}
                <small>%</small>
              </b>
              <span>work logged</span>
            </div>
          </div>
        </div>
        <div className="today-stats">
          <div className="stat-completed">
            <span className="stat-icon">
              <Timer size={20} aria-hidden="true" />
            </span>
            <div className="stat-value">
              <b>
                {hours(doneMinutes)}
                <small> h</small>
              </b>
              <span>Study completed</span>
            </div>
          </div>
          <div className="stat-remaining">
            <span className="stat-icon">
              <Clock3 size={20} aria-hidden="true" />
            </span>
            <div className="stat-value">
              <b>
                {hours(remainingMinutes)}
                <small> h</small>
              </b>
              <span>Work remaining</span>
            </div>
          </div>
          <div className="stat-submitted">
            <span className="stat-icon">
              <CircleCheck size={20} aria-hidden="true" />
            </span>
            <div className="stat-value">
              <b>
                {submitted}
                <small> / {project.assessments.length}</small>
              </b>
              <span>Assessments submitted</span>
            </div>
          </div>
        </div>
        <div className="overview-progress">
          <div className="progress-caption">
            <span>{percent}% of estimated work logged</span>
            <span>
              {done.length} completed{" "}
              {done.length === 1 ? "session" : "sessions"}
            </span>
          </div>
          <progress
            className="work-progress"
            max={100}
            value={percent}
            aria-label="Study progress"
          />
        </div>
      </section>
      {!!review.length && (
        <button
          className="today-alert notice"
          onClick={() => navigate("assessments")}
        >
          <TriangleAlert size={19} />
          <span>
            <strong>
              {review.length} assessment{review.length === 1 ? "" : "s"} need a
              source check.
            </strong>{" "}
            Review details or confirm missing dates to include them in your
            plan.
          </span>
          <ArrowRight size={18} />
        </button>
      )}
      {!!shortfall && (
        <div className="today-alert notice">
          <TriangleAlert size={19} />
          <span>
            <strong>
              {hours(shortfall)}{" "}
              {shortfall === 60 ? "hour still needs" : "hours still need"} room.
            </strong>{" "}
            Some deadlines cannot fit your current availability.
          </span>
          <button className="button secondary small" onClick={recover}>
            Make room
          </button>
        </div>
      )}
      <div className="today-grid">
        <section
          className="panel today-sessions"
          aria-labelledby="sessions-title"
        >
          <div className="panel-head">
            <div>
              <h2 id="sessions-title">
                {todayBlocks.length
                  ? "Your next steps today"
                  : "Next study sessions"}
              </h2>
              <p>
                Log a finished session to reduce the work left. Move one if life
                gets in the way.
              </p>
            </div>
            <CalendarClock size={24} />
          </div>
          <ol className="session-list">
            {displayBlocks.map((block, index) => (
              <li
                className={`session-card ${index === 0 ? "is-next" : ""}`}
                key={block.id}
              >
                {index === 0 && (
                  <span className="next-session-label">
                    <CalendarClock size={14} aria-hidden="true" />
                    Up next
                  </span>
                )}
                <div className="session-meta">
                  {dateLabel(block.start.slice(0, 10))} ·{" "}
                  {block.start.slice(11, 16)}–{block.end.slice(11, 16)}
                  <span>{block.minutes} min</span>
                </div>
                <h3>{block.title}</h3>
                <p>{block.module}</p>
                {(() => {
                  const item = project.assessments.find(
                    (row) => row.id === block.assessment_id,
                  );
                  const open = item?.tasks.filter((row) => !row.done) || [];
                  return item?.tasks.length ? (
                    <div className="session-checklist">
                      <p>
                        {item.tasks.filter((row) => row.done).length}/
                        {item.tasks.length} steps complete
                      </p>
                      {item.tasks.slice(0, 3).map((task) => (
                        <label className="check-row" key={task.id}>
                          <input
                            type="checkbox"
                            disabled={busy}
                            checked={task.done}
                            onChange={() => toggleTask(item.id, task.id)}
                          />
                          <span className={task.done ? "task-done" : ""}>
                            {task.title}
                          </span>
                        </label>
                      ))}
                      <button className="text-link" onClick={() => edit(item)}>
                        {open.length ? "Edit checklist" : "Checklist finished"}
                      </button>
                    </div>
                  ) : null;
                })()}
                <StudyActions
                  block={block}
                  busy={busy}
                  action={action}
                  focus={focus}
                />
              </li>
            ))}
          </ol>
          {!displayBlocks.length && (
            <div className="empty-small">
              <CircleCheck size={26} />
              <p>
                {remainingMinutes
                  ? "There are no available sessions. Review your dates and hours in the study plan."
                  : "Your estimated study work is finished. Check your submissions before putting your feet up."}
              </p>
            </div>
          )}
          <button className="text-link" onClick={() => navigate("study")}>
            Open the full study plan <ArrowRight size={16} />
          </button>
        </section>
        <section
          className="panel today-deadlines"
          aria-labelledby="urgent-title"
        >
          <div className="panel-head">
            <div>
              <h2 id="urgent-title">
                {urgent.length ? "Due in the next 7 days" : "Coming up next"}
              </h2>
              <p>
                {urgent.length
                  ? "Overdue work stays here until you submit it."
                  : "Get started before deadline week arrives."}
              </p>
            </div>
          </div>
          <ul className="priority-list">
            {deadlines.map((item) => {
              const gap = daysBetween(today, item.due_date!);
              const logged = done
                .filter((row) => row.assessment_id === item.id)
                .reduce((sum, row) => sum + row.minutes, 0);
              return (
                <li key={item.id}>
                  <div className="priority-date" aria-hidden="true">
                    <b>{Number(item.due_date!.slice(8, 10))}</b>
                    <span>
                      {new Intl.DateTimeFormat("en-IE", {
                        month: "short",
                        timeZone: "UTC",
                      }).format(new Date(`${item.due_date}T12:00:00Z`))}
                    </span>
                  </div>
                  <div className="priority-body">
                    <div className="priority-meta">
                      <span className={`chip ${gap < 1 ? "warn" : ""}`}>
                        {gap < 0
                          ? `${-gap} days overdue`
                          : gap === 0
                            ? "Due today"
                            : gap === 1
                              ? "Due tomorrow"
                              : dateLabel(item.due_date)}
                        {item.due_time ? ` · ${item.due_time.slice(0, 5)}` : ""}
                      </span>
                      <span>
                        {item.weight_percent === null
                          ? ""
                          : `${item.weight_percent}%`}
                      </span>
                    </div>
                    <button
                      className="priority-title text-link"
                      onClick={() => edit(item)}
                    >
                      {item.title}
                    </button>
                    <p>{item.module}</p>
                    <div className="priority-footer">
                      <span>
                        {hours(item.effort_minutes)} h left
                        {logged > 0 ? ` · ${hours(logged)} h logged` : ""}
                      </span>
                      <button
                        className="button secondary small"
                        disabled={busy}
                        onClick={() => submit(item)}
                      >
                        Mark submitted
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {!deadlines.length && (
            <p className="empty-small">
              No confirmed deadlines in the next seven days.
            </p>
          )}
          <button className="text-link" onClick={() => navigate("assessments")}>
            All assessments <ArrowRight size={16} />
          </button>
        </section>
      </div>
      <div className="today-insights">
        <WeeklyProgress project={project} settings={settings} />
        <UpcomingCommitments project={project} edit={commitments} />
      </div>
      {!!recent.length && (
        <section className="panel recent-work" aria-labelledby="history-title">
          <div className="panel-head">
            <div>
              <h2 id="history-title">Recent activity</h2>
              <p>Finished work stays recorded when your plan changes.</p>
            </div>
          </div>
          <ul>
            {recent.map((row) => (
              <li key={row.id}>
                <CircleCheck size={18} />
                <div>
                  <strong>{row.title}</strong>
                  <small>
                    {row.state === "done"
                      ? `${row.minutes} min completed`
                      : "Session moved"}{" "}
                    · {dateLabel(row.start.slice(0, 10))} ·{" "}
                    {row.start.slice(11, 16)}
                  </small>
                </div>
                {row.state === "done" &&
                  !row.feedback &&
                  project.assessments.some(
                    (item) => item.id === row.assessment_id && !item.completed,
                  ) &&
                  [...project.study_history]
                    .reverse()
                    .find(
                      (entry) =>
                        entry.state === "done" &&
                        entry.assessment_id === row.assessment_id,
                    )?.id === row.id && (
                    <button
                      className="button secondary small"
                      disabled={busy}
                      aria-label={`Check progress: ${row.title} at ${row.start.slice(11, 16)}`}
                      onClick={() => checkProgress(row.id)}
                    >
                      Check progress
                    </button>
                  )}
                <button
                  className="button secondary small"
                  disabled={busy}
                  onClick={() => action("undo", row.id)}
                  aria-label={`Undo ${row.title} at ${row.start.slice(11, 16)}`}
                >
                  <Undo2 size={15} />
                  Undo
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
