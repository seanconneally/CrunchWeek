import { useState } from "react";
import { CircleCheck, X } from "lucide-react";
import type { CheckInStatus, Project } from "../types";
import { message } from "../api";
export function SessionCheckIn({
  project,
  activityId,
  close,
  save,
  busy: parentBusy,
}: {
  project: Project;
  activityId: string;
  close: () => void;
  save: (
    status: CheckInStatus,
    remaining: number | null,
    expected: number,
  ) => Promise<void>;
  busy: boolean;
}) {
  const entry = project.study_history.find((row) => row.id === activityId);
  const item = project.assessments.find(
    (row) => row.id === entry?.assessment_id,
  );
  const [baseline, setBaseline] = useState(item?.effort_minutes || 0);
  const [remaining, setRemaining] = useState(
    Math.min(12000, (item?.effort_minutes || 0) + 60),
  );
  const [status, setStatus] = useState<CheckInStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!entry || !item || item.completed || entry.feedback) return null;
  const stale = baseline !== item.effort_minutes;
  const submit = async (choice: CheckInStatus) => {
    setBusy(true);
    setError("");
    try {
      await save(
        choice,
        choice === "need_more_time" ? remaining : null,
        baseline,
      );
      close();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="panel session-check-in"
      aria-labelledby="check-in-title"
    >
      <div className="panel-head">
        <div>
          <h2 id="check-in-title">How did that session go?</h2>
          <p>
            {item.title} · {entry.minutes} minutes logged ·{" "}
            {item.effort_minutes / 60} hours estimated left
          </p>
        </div>
        <button
          className="icon-button"
          aria-label="Skip progress check"
          disabled={busy}
          onClick={close}
        >
          <X size={18} />
        </button>
      </div>
      {stale && (
        <div className="notice">
          <p>Your estimate changed in the app. That edit has been kept.</p>
          <button
            className="text-link"
            onClick={() => {
              setBaseline(item.effort_minutes);
              setRemaining(Math.min(12000, item.effort_minutes + 60));
              setStatus(null);
            }}
          >
            Use latest estimate
          </button>
        </div>
      )}
      <div className="check-in-options">
        <button
          className="button secondary"
          disabled={busy || parentBusy || stale}
          onClick={() => submit("on_track")}
        >
          <CircleCheck size={16} />
          On track
        </button>
        <button
          className={`button ${status === "need_more_time" ? "primary" : "secondary"}`}
          disabled={busy || parentBusy || stale}
          onClick={() => setStatus("need_more_time")}
        >
          Need more time
        </button>
        <button
          className={`button ${status === "finished" ? "primary" : "secondary"}`}
          disabled={busy || parentBusy || stale}
          onClick={() => setStatus("finished")}
        >
          Finished
        </button>
      </div>
      {status && (
        <form
          className="check-in-detail"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(status);
          }}
        >
          {status === "need_more_time" ? (
            <>
              <label className="field">
                Revised remaining work (hours)
                <input
                  type="number"
                  required
                  min={(baseline + 30) / 60}
                  max={200}
                  step={0.5}
                  value={remaining / 60}
                  onChange={(e) =>
                    setRemaining(Math.round(Number(e.target.value) * 60))
                  }
                />
              </label>
              <div className="check-in-options">
                {[30, 60, 120].map((minutes) => (
                  <button
                    type="button"
                    className="button secondary small"
                    key={minutes}
                    disabled={baseline + minutes > 12000}
                    onClick={() => setRemaining(baseline + minutes)}
                  >
                    +{minutes / 60} h
                  </button>
                ))}
              </div>
              <p className="small muted">
                {baseline / 60} → {remaining / 60} hours left. Your plan will
                make room where possible and show anything that cannot fit.
              </p>
            </>
          ) : (
            <p>
              Set remaining study work to zero and remove its future study
              sessions. You still need to submit the assessment; its deadline
              stays visible.
            </p>
          )}
          <button
            className="button primary"
            disabled={
              busy ||
              parentBusy ||
              stale ||
              (status === "need_more_time" && remaining <= baseline)
            }
          >
            {busy
              ? "Saving…"
              : status === "finished"
                ? "Confirm study work finished"
                : "Confirm remaining hours"}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
