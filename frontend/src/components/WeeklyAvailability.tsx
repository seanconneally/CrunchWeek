import type { Settings } from "../types";
const days = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
export function WeeklyAvailability({
  settings,
  change,
}: {
  settings: Settings;
  change: (value: Partial<Settings>) => void;
}) {
  const custom = settings.weekly_windows.length > 0;
  return (
    <fieldset className="form-section weekday-hours">
      <legend>Your week, your hours</legend>
      <label className="check-row">
        <input
          type="checkbox"
          checked={custom}
          onChange={(e) =>
            change({
              weekly_windows: e.target.checked
                ? settings.weekdays.map((weekday) => ({
                    weekday,
                    start: settings.day_start,
                    minutes: settings.daily_minutes,
                  }))
                : [],
            })
          }
        />
        Use different hours for each weekday
      </label>
      {custom && (
        <>
          <p className="small muted">
            These windows replace the general daily hours above. Keep at least
            one study day.
          </p>
          <div className="availability-grid">
            {days.map((day, weekday) => {
              const window = settings.weekly_windows.find(
                (row) => row.weekday === weekday,
              );
              const patch = (value: Partial<NonNullable<typeof window>>) =>
                change({
                  weekly_windows: settings.weekly_windows.map((row) =>
                    row.weekday === weekday ? { ...row, ...value } : row,
                  ),
                });
              return (
                <div key={day} className="availability-day">
                  <label className="check-row">
                    <input
                      aria-label={`${day} available`}
                      type="checkbox"
                      checked={!!window}
                      disabled={
                        !!window && settings.weekly_windows.length === 1
                      }
                      onChange={(e) =>
                        change({
                          weekly_windows: e.target.checked
                            ? [
                                ...settings.weekly_windows,
                                {
                                  weekday,
                                  start: settings.day_start,
                                  minutes: settings.daily_minutes,
                                },
                              ]
                            : settings.weekly_windows.filter(
                                (row) => row.weekday !== weekday,
                              ),
                        })
                      }
                    />
                    {day}
                  </label>
                  <label className="field">
                    <span className="sr-only">{day} study start</span>
                    <input
                      aria-label={`${day} study start`}
                      type="time"
                      step="1800"
                      disabled={!window}
                      required={!!window}
                      value={window?.start.slice(0, 5) || "17:00"}
                      onChange={(e) => patch({ start: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span className="sr-only">{day} study hours</span>
                    <input
                      aria-label={`${day} study hours`}
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="8"
                      disabled={!window}
                      required={!!window}
                      value={window ? window.minutes / 60 : ""}
                      placeholder="Off"
                      onChange={(e) =>
                        patch({
                          minutes: Math.round(Number(e.target.value) * 60),
                        })
                      }
                    />
                  </label>
                </div>
              );
            })}
          </div>
        </>
      )}
    </fieldset>
  );
}
