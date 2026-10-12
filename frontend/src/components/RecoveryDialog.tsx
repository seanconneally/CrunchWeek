import { useEffect, useState } from "react";
import { ArrowRight, CalendarPlus, ShieldCheck } from "lucide-react";
import type { Project, RecoveryOption, RecoveryResponse } from "../types";
import { message, request } from "../api";
import { dateLabel } from "../utils";
import { Modal } from "./Modal";
const hours = (minutes: number) =>
  new Intl.NumberFormat("en-IE", { maximumFractionDigits: 1 }).format(
    minutes / 60,
  );
export function RecoveryDialog({
  project,
  close,
  apply,
  settings,
  review,
}: {
  project: Project;
  close: () => void;
  apply: (option: RecoveryOption) => Promise<void>;
  settings: () => void;
  review: () => void;
}) {
  const [result, setResult] = useState<RecoveryResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError("");
    request<RecoveryResponse>("/recovery", project, controller.signal)
      .then(setResult)
      .catch((err) => {
        if (!controller.signal.aborted) setError(message(err));
      });
    return () => controller.abort();
  }, [project, revision]);
  return (
    <Modal title="Make room for the work" close={close} busy={busy}>
      <p className="muted">
        Compare realistic changes before committing to them. Your deadlines,
        work estimates, protected time and study history stay intact.
      </p>
      {!result && !error && (
        <p role="status" className="planning">
          <span className="spinner" />
          Comparing available time…
        </p>
      )}
      {result && (
        <>
          <div className="recovery-baseline">
            <ShieldCheck size={26} />
            <div>
              <strong>
                {hours(result.baseline_minutes)}{" "}
                {result.baseline_minutes === 60 ? "hour" : "hours"} currently
                unscheduled
              </strong>
              <p>Calculated from now, in {project.settings.timezone}.</p>
            </div>
          </div>
          {result.baseline_minutes === 0 ? (
            <p className="notice success">
              Your confirmed work fits the current plan. Revisit this after a
              missed session or a change in workload.
            </p>
          ) : (
            <>
              {result.options.map((option) => (
                <section
                  className="recovery-option"
                  key={option.id}
                  aria-label={option.title}
                >
                  <h3>{option.title}</h3>
                  <div className="recovery-metrics">
                    <span>
                      <b>{hours(option.recovered_minutes)} h</b> recovered
                    </span>
                    <span>
                      <b>{hours(option.remaining_minutes)} h</b> still
                      unscheduled
                    </span>
                    <span>
                      <b>{hours(option.added_minutes)} h</b> extra commitment
                    </span>
                  </div>
                  {option.buffer_days !== project.settings.buffer_days && (
                    <p className="small">
                      Extra clear days: {project.settings.buffer_days} →{" "}
                      {option.buffer_days}. Study still finishes before deadline
                      day.
                    </p>
                  )}
                  {!!option.extra_windows.length && (
                    <div className="recovery-dates">
                      <p>
                        <CalendarPlus size={16} />
                        Only these extra sessions are added:
                      </p>
                      <ul>
                        {option.extra_windows.map((row, i) => (
                          <li key={i}>
                            {dateLabel(row.date, true)} ·{" "}
                            {row.start.slice(0, 5)} · {row.minutes} min
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <ul className="recovery-impacts">
                    {option.impacts.map((row) => (
                      <li key={row.assessment_id}>
                        <div>
                          <strong>{row.title}</strong>
                          <small>
                            {row.module} · due {dateLabel(row.due_date)}
                          </small>
                        </div>
                        <span>
                          {hours(row.before_minutes)} h <ArrowRight size={14} />{" "}
                          {hours(row.after_minutes)} h left to fit
                        </span>
                      </li>
                    ))}
                  </ul>
                  <button
                    className="button primary"
                    aria-label={`Apply: ${option.title}`}
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      setError("");
                      try {
                        await apply(option);
                        close();
                      } catch (err) {
                        setError(message(err));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {busy ? "Applying…" : "Use this option"}
                  </button>
                </section>
              ))}
              {!result.options.length && (
                <p className="notice">
                  Small capacity changes cannot recover this work. Check the
                  reasons below; you may need more availability, a corrected
                  date, or support from your lecturer.
                </p>
              )}
              <details className="recovery-reasons">
                <summary>
                  Why work cannot fit ({result.shortfalls.length})
                </summary>
                <ul>
                  {result.shortfalls.map((row) => (
                    <li key={row.assessment_id}>
                      <strong>{row.label}</strong>
                      <p>
                        {hours(row.minutes)} h · {row.reason}
                      </p>
                    </li>
                  ))}
                </ul>
              </details>
            </>
          )}
          <div className="recovery-next">
            <button
              className="button secondary"
              disabled={busy}
              onClick={settings}
            >
              Edit availability
            </button>
            <button className="text-link" disabled={busy} onClick={review}>
              Review assessment estimates
            </button>
          </div>
        </>
      )}
      {error && (
        <div className="error" role="alert">
          <p>{error}</p>
          <button
            className="button secondary small"
            disabled={busy}
            onClick={() => {
              setError("");
              setRevision((value) => value + 1);
            }}
          >
            Compare again
          </button>
        </div>
      )}
    </Modal>
  );
}
