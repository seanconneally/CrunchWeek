import { Plus, Trash2 } from "lucide-react";
import type { Settings } from "../types";
import { dateLabel } from "../utils";
const days = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
export function ProtectedTime({
  settings,
  change,
  commitmentsOnly = false,
}: {
  settings: Settings;
  change: (patch: Partial<Settings>) => void;
  commitmentsOnly?: boolean;
}) {
  return (
    <>
      <fieldset className="form-section protected-time">
        <legend>Lectures, work & other commitments</legend>
        <p className="small muted">
          Protect training, work, lectures or appointments. Choose weekly or a
          single date. Any overlap removes that half-hour study slot. Times use{" "}
          {settings.timezone}; split overnight commitments into separate days.
        </p>
        {settings.commitments.map((row, index) => {
          const patch = (value: Partial<typeof row>) =>
            change({
              commitments: settings.commitments.map((item) =>
                item.id === row.id ? { ...item, ...value } : item,
              ),
            });
          return (
            <div className="commitment-row" key={row.id}>
              <label className="field commitment-title">
                Commitment {index + 1}
                <input
                  aria-label={`Commitment ${index + 1} name`}
                  required
                  maxLength={100}
                  placeholder="Lecture, shift, training…"
                  value={row.title}
                  onChange={(e) => patch({ title: e.target.value })}
                />
              </label>
              <label className="field">
                Repeats
                <select
                  aria-label={`Commitment ${index + 1} repeat`}
                  value={row.date !== null ? "once" : "weekly"}
                  onChange={(e) =>
                    patch({
                      date:
                        e.target.value === "once" ? settings.plan_from : null,
                    })
                  }
                >
                  <option value="weekly">Every week</option>
                  <option value="once">One date</option>
                </select>
              </label>
              {row.date !== null ? (
                <label className="field">
                  Date
                  <input
                    type="date"
                    required
                    min={settings.semester_start}
                    max={settings.semester_end}
                    aria-label={`Commitment ${index + 1} date`}
                    value={row.date}
                    onChange={(e) => patch({ date: e.target.value })}
                  />
                </label>
              ) : (
                <label className="field">
                  Day
                  <select
                    aria-label={`Commitment ${index + 1} day`}
                    value={row.weekday}
                    onChange={(e) => patch({ weekday: Number(e.target.value) })}
                  >
                    {days.map((day, weekday) => (
                      <option key={day} value={weekday}>
                        {day}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="field">
                From
                <input
                  type="time"
                  required
                  aria-label={`Commitment ${index + 1} start`}
                  value={row.start.slice(0, 5)}
                  onChange={(e) => patch({ start: e.target.value })}
                />
              </label>
              <label className="field">
                Until
                <input
                  type="time"
                  required
                  aria-label={`Commitment ${index + 1} end`}
                  value={row.end.slice(0, 5)}
                  onChange={(e) => patch({ end: e.target.value })}
                />
              </label>
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove commitment ${index + 1}`}
                onClick={() =>
                  change({
                    commitments: settings.commitments.filter(
                      (item) => item.id !== row.id,
                    ),
                  })
                }
              >
                <Trash2 size={18} />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          className="button secondary small"
          disabled={settings.commitments.length >= 50}
          onClick={() =>
            change({
              commitments: [
                ...settings.commitments,
                {
                  id: crypto.randomUUID(),
                  title: "",
                  date: null,
                  weekday: 0,
                  start: "17:00",
                  end: "18:00",
                },
              ],
            })
          }
        >
          <Plus size={16} />
          Add work, training or a class
        </button>
      </fieldset>
      {!commitmentsOnly && (
        <fieldset className="form-section protected-time">
          <legend>One-off study time</legend>
          <p className="small muted">
            Make a little extra room on a specific date. Overlapping windows
            count once, and days off and protected time still apply.
          </p>
          {settings.extra_windows.map((row, index) => {
            const patch = (value: Partial<typeof row>) =>
              change({
                extra_windows: settings.extra_windows.map((item, i) =>
                  i === index ? { ...item, ...value } : item,
                ),
              });
            return (
              <div className="extra-time-row" key={index}>
                <label className="field">
                  Date
                  <input
                    type="date"
                    required
                    min={settings.semester_start}
                    max={settings.semester_end}
                    aria-label={`Extra session ${index + 1} date`}
                    value={row.date}
                    onChange={(e) => patch({ date: e.target.value })}
                  />
                </label>
                <label className="field">
                  Start
                  <input
                    type="time"
                    required
                    step={1800}
                    aria-label={`Extra session ${index + 1} start`}
                    value={row.start.slice(0, 5)}
                    onChange={(e) => patch({ start: e.target.value })}
                  />
                </label>
                <label className="field">
                  Hours
                  <input
                    type="number"
                    required
                    step={0.5}
                    min={0.5}
                    max={8}
                    aria-label={`Extra session ${index + 1} hours`}
                    value={row.minutes / 60}
                    onChange={(e) =>
                      patch({
                        minutes: Math.round(Number(e.target.value) * 60),
                      })
                    }
                  />
                </label>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove extra session ${index + 1} on ${dateLabel(row.date)}`}
                  onClick={() =>
                    change({
                      extra_windows: settings.extra_windows.filter(
                        (_, i) => i !== index,
                      ),
                    })
                  }
                >
                  <Trash2 size={18} />
                </button>
              </div>
            );
          })}
          <button
            type="button"
            className="button secondary small"
            disabled={settings.extra_windows.length >= 90}
            onClick={() =>
              change({
                extra_windows: [
                  ...settings.extra_windows,
                  { date: settings.plan_from, start: "12:00", minutes: 30 },
                ],
              })
            }
          >
            <Plus size={16} />
            Add one-off study time
          </button>
        </fieldset>
      )}
    </>
  );
}
