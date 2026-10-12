import { useEffect, useState } from "react";
import { Pause, Play, Timer, X } from "lucide-react";
import { FOCUS_KEY, focusElapsed } from "../focus";
import type { FocusSession } from "../focus";
import type { Project } from "../types";

export function FocusDock({
  session,
  project,
  change,
  complete,
  openProject,
  busy,
}: {
  session: FocusSession | null;
  project: Project;
  busy: boolean;
  change: (value: FocusSession | null) => void;
  complete: (session: FocusSession) => void;
  openProject: (id: string) => void;
}) {
  const [now, setNow] = useState(Date.now());
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    try {
      if (session) localStorage.setItem(FOCUS_KEY, JSON.stringify(session));
      else localStorage.removeItem(FOCUS_KEY);
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [session]);
  useEffect(() => {
    setNow(Date.now());
    if (!session || session.started_at === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [session]);
  const elapsed = session ? focusElapsed(session, now) : 0;
  const duration = session ? session.block.minutes * 60000 : 0;
  useEffect(() => {
    if (session && session.started_at !== null && elapsed >= duration) {
      change({ ...session, started_at: null, elapsed_ms: duration });
    }
  }, [session, elapsed, duration, change]);
  if (!session) return null;
  const remaining = Math.max(0, Math.ceil((duration - elapsed) / 1000));
  const own = session.project_id === project.id;
  return (
    <aside className="focus-dock" aria-label="Focus timer">
      <div className="focus-top">
        <span>
          <Timer size={17} />
          {remaining ? "Focus time" : "Time for a breather"}
        </span>
        <button
          className="icon-button"
          disabled={busy}
          aria-label="End focus timer"
          onClick={() => change(null)}
        >
          <X size={18} />
        </button>
      </div>
      <h2>{session.block.title}</h2>
      <p className="focus-module">{session.block.module}</p>
      <div className="focus-controls">
        <output className="focus-clock" aria-label="Time remaining">
          {String(Math.floor(remaining / 60)).padStart(2, "0")}:
          {String(remaining % 60).padStart(2, "0")}
        </output>
        {remaining > 0 && (
          <button
            className="button secondary small"
            onClick={() =>
              change(
                session.started_at === null
                  ? { ...session, started_at: Date.now() }
                  : {
                      ...session,
                      elapsed_ms: focusElapsed(session),
                      started_at: null,
                    },
              )
            }
          >
            {session.started_at === null ? (
              <Play size={16} />
            ) : (
              <Pause size={16} />
            )}
            {session.started_at === null ? "Resume" : "Pause"}
          </button>
        )}
        {own ? (
          <button
            className="button primary small"
            disabled={busy || remaining > 0}
            onClick={() => complete(session)}
          >
            Log {session.block.minutes} min
          </button>
        ) : (
          <button
            className="button secondary small"
            disabled={busy}
            onClick={() => openProject(session.project_id)}
          >
            Open its semester
          </button>
        )}
      </div>
      <progress
        className="work-progress"
        aria-label="Focus session elapsed"
        max={duration}
        value={elapsed}
      />
      <p className="focus-note">
        {storageError
          ? "Timer cannot be saved in this browser. Keep this tab open."
          : "Pause anytime. Finishing the timer never logs work automatically."}
      </p>
    </aside>
  );
}
