import { useState } from "react";
import { CalendarX2, FileText } from "lucide-react";
import type { Assessment, AssessmentKind } from "../types";
import { Modal } from "./Modal";

export function AssessmentEditor({
  item,
  close,
  save,
}: {
  item: Assessment;
  close: () => void;
  save: (item: Assessment) => Promise<void>;
}) {
  const [draft, setDraft] = useState(item);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const change = (patch: Partial<Assessment>) =>
    setDraft((old) => ({ ...old, ...patch, reviewed: false }));
  return (
    <Modal
      title={item.title ? "Review assessment" : "Add an assessment"}
      close={close}
      busy={busy}
    >
      <form
        className="stack-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            await save(draft);
            close();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <figure className="evidence">
          <figcaption>
            <FileText size={16} aria-hidden="true" />
            Source: {draft.source_file}
            {draft.source_page ? `, page ${draft.source_page}` : ""}
          </figcaption>
          <blockquote>
            {draft.evidence ||
              "Manual entry. Check this assessment against your official module information."}
          </blockquote>
        </figure>
        <div className="form-grid">
          <label className="field">
            Module
            <input
              required
              maxLength={120}
              value={draft.module}
              onChange={(e) => change({ module: e.target.value })}
              placeholder="e.g. CS401 · Applied AI"
            />
          </label>
          <label className="field">
            Assessment name
            <input
              required
              maxLength={200}
              value={draft.title}
              onChange={(e) => change({ title: e.target.value })}
            />
          </label>
          <label className="field">
            Type
            <select
              value={draft.kind}
              onChange={(e) =>
                change({ kind: e.target.value as AssessmentKind })
              }
            >
              {[
                "Assignment",
                "Exam",
                "Project",
                "Presentation",
                "Quiz",
                "Other",
              ].map((kind) => (
                <option key={kind}>{kind}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Weight within module (%)
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={draft.weight_percent ?? ""}
              placeholder="Unknown"
              onChange={(e) =>
                change({
                  weight_percent:
                    e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </label>
          <label className="field">
            Deadline date
            <input
              type="date"
              value={draft.due_date ?? ""}
              onChange={(e) =>
                change({
                  due_date: e.target.value || null,
                  due_time: e.target.value ? draft.due_time : null,
                })
              }
            />
          </label>
          <label className="field">
            Deadline time (optional)
            <input
              type="time"
              disabled={!draft.due_date}
              value={draft.due_time?.slice(0, 5) ?? ""}
              onChange={(e) => change({ due_time: e.target.value || null })}
            />
          </label>
          {!draft.due_date && (
            <p className="pencil-note span-two">
              <CalendarX2 size={18} aria-hidden="true" />
              An unknown date is allowed. It stays visible, but cannot be
              scheduled.
            </p>
          )}
          <label className="field span-two">
            Remaining work (hours)
            <input
              type="number"
              min="0"
              max="200"
              step="0.5"
              required
              value={draft.effort_minutes / 60}
              onChange={(e) =>
                change({
                  effort_minutes: Math.round(Number(e.target.value) * 60),
                })
              }
            />
            <small>
              Your estimate, not an AI prediction. Set to 0 when the work is
              finished.
            </small>
          </label>
          <label className="field span-two">
            Notes
            <textarea
              maxLength={2000}
              rows={3}
              value={draft.notes}
              onChange={(e) => change({ notes: e.target.value })}
            />
          </label>
        </div>
        <label className={`confirm ${draft.reviewed ? "is-inked" : ""}`}>
          <input
            type="checkbox"
            checked={draft.reviewed}
            onChange={(e) =>
              setDraft((old) => ({ ...old, reviewed: e.target.checked }))
            }
          />
          I checked the date, time and weighting against the source.
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={close}
          >
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : "Save assessment"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
