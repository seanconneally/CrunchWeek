import { useState } from "react";
import type { Project, Settings } from "../types";
import { Modal } from "./Modal";

export function SettingsEditor({
  project,
  close,
  save,
}: {
  project: Project;
  close: () => void;
  save: (project: Project) => Promise<void>;
}) {
  const [settings, setSettings] = useState(project.settings);
  const [name, setName] = useState(project.name);
  const [daysOff, setDaysOff] = useState(settings.days_off.join(", "));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const change = (patch: Partial<Settings>) =>
    setSettings((old) => ({ ...old, ...patch }));
  return (
    <Modal title="Make room for real life" close={close} busy={busy}>
      <p className="muted">
        Choose hours you are actually free. Study blocks share this capacity and
        finish before deadline day.
      </p>
      <form
        className="stack-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await save({
              ...project,
              name,
              settings: {
                ...settings,
                days_off: daysOff
                  .split(",")
                  .map((day) => day.trim())
                  .filter(Boolean),
              },
            });
            close();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Invalid settings");
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset className="form-section">
          <legend>Semester</legend>
          <div className="form-grid">
            <label className="field span-two">
              Semester name
              <input
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="field">
              Week 1 begins
              <input
                type="date"
                required
                value={settings.semester_start}
                onChange={(e) => change({ semester_start: e.target.value })}
              />
            </label>
            <label className="field">
              Semester ends
              <input
                type="date"
                required
                value={settings.semester_end}
                onChange={(e) => change({ semester_end: e.target.value })}
              />
            </label>
            <label className="field">
              Plan from
              <input
                type="date"
                required
                value={settings.plan_from}
                onChange={(e) => change({ plan_from: e.target.value })}
              />
            </label>
            <label className="field">
              Timezone
              <input
                required
                value={settings.timezone}
                onChange={(e) => change({ timezone: e.target.value })}
              />
            </label>
          </div>
        </fieldset>
        <fieldset className="form-section">
          <legend>When you can study</legend>
          <div className="form-grid">
            <label className="field">
              Daily study start
              <input
                type="time"
                step="1800"
                required
                value={settings.day_start.slice(0, 5)}
                onChange={(e) => change({ day_start: e.target.value })}
              />
            </label>
            <label className="field">
              Available hours each day
              <input
                type="number"
                min="0.5"
                max="8"
                step="0.5"
                required
                value={settings.daily_minutes / 60}
                onChange={(e) =>
                  change({
                    daily_minutes: Math.round(Number(e.target.value) * 60),
                  })
                }
              />
            </label>
            <label className="field">
              Study block length
              <select
                value={settings.block_minutes}
                onChange={(e) =>
                  change({
                    block_minutes: Number(
                      e.target.value,
                    ) as Settings["block_minutes"],
                  })
                }
              >
                {[30, 60, 90, 120].map((n) => (
                  <option key={n} value={n}>
                    {n} minutes
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Extra clear days before deadline
              <input
                type="number"
                min="0"
                max="14"
                required
                value={settings.buffer_days}
                onChange={(e) =>
                  change({ buffer_days: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <fieldset className="weekday-picker">
            <legend>Available weekdays</legend>
            <div className="weekday-chips">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                (day, i) => (
                  <label
                    key={day}
                    className={settings.weekdays.includes(i) ? "selected" : ""}
                  >
                    <input
                      type="checkbox"
                      checked={settings.weekdays.includes(i)}
                      onChange={(e) =>
                        change({
                          weekdays: e.target.checked
                            ? [...settings.weekdays, i]
                            : settings.weekdays.filter((d) => d !== i),
                        })
                      }
                    />
                    {day}
                  </label>
                ),
              )}
            </div>
          </fieldset>
          <label className="field">
            Days off (comma-separated YYYY-MM-DD)
            <input
              value={daysOff}
              onChange={(e) => setDaysOff(e.target.value)}
              placeholder="2026-11-02, 2026-11-03"
            />
          </label>
        </fieldset>
        <p className="small muted">
          Changing semester dates does not move extracted deadlines. Review
          dates derived from teaching weeks if your calendar changes.
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : "Save & rebuild plan"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
