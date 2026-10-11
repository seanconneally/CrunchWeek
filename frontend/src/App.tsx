import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  CalendarClock,
  ChartNoAxesColumn,
  Download,
  FlaskConical,
  ListChecks,
  Plus,
  RotateCcw,
  Settings2,
  Share,
  Upload,
  X,
} from "lucide-react";
import type { Assessment, Config, PlanResponse, Project, Tab } from "./types";
import { message, request, saveBlob } from "./api";
import { Dashboard } from "./components/Dashboard";
import { Assessments } from "./components/Assessments";
import { AssessmentEditor } from "./components/AssessmentEditor";
import { SettingsEditor } from "./components/SettingsEditor";
import { UploadDialog } from "./components/UploadDialog";
import { StudyPlan } from "./components/StudyPlan";
import { NotionPanel } from "./components/NotionPanel";
import { addDays, dateLabel, daysBetween, todayIn } from "./utils";

const STORAGE_KEY = "crunch-week-project-v1";
const nav = [
  { id: "overview", label: "Overview", icon: ChartNoAxesColumn },
  { id: "assessments", label: "Assessments", icon: ListChecks },
  { id: "study", label: "Study plan", icon: CalendarClock },
  { id: "notion", label: "Notion & exports", icon: Share },
] as const;

export default function App() {
  const [project, setProject] = useState<Project | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [result, setResult] = useState<PlanResponse | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [modal, setModal] = useState<"settings" | "upload" | null>(null);
  const [editing, setEditing] = useState<Assessment | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [saved, setSaved] = useState(false);
  const restoreInput = useRef<HTMLInputElement>(null);
  const projectRef = useRef<Project | null>(null);

  function persist(next: Project) {
    projectRef.current = next;
    setProject(next);
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setSaved(true);
    } catch {
      setSaved(false);
      setError(
        "Browser storage is full or unavailable. Download a project backup to keep your changes.",
      );
    }
  }
  async function validateAndSave(next: Project) {
    persist(await request<Project>("/project/validate", next));
  }
  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const [settings, fresh] = await Promise.all([
          request<Config>("/config"),
          request<Project>("/project/new"),
        ]);
        if (!active) return;
        setConfig(settings);
        let stored: string | null = null;
        try {
          stored = sessionStorage.getItem(STORAGE_KEY);
        } catch {
          /* Downloads remain available. */
        }
        if (stored) {
          try {
            const restored = await request<Project>(
              "/project/validate",
              JSON.parse(stored),
            );
            if (active) persist(restored);
            return;
          } catch {
            if (active)
              setError(
                "The saved tab project could not be restored. Import a project backup, or start a new semester.",
              );
          }
        }
        if (active) persist(fresh);
      } catch (err) {
        if (active)
          setError(
            `Cannot connect to the backend. Start FastAPI, then refresh. ${message(err)}`,
          );
      }
    }
    void initialize();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!project) return;
    const controller = new AbortController();
    setPlanning(true);
    setResult(null);
    request<PlanResponse>("/plan", project, controller.signal)
      .then(setResult)
      .catch((err) => {
        if (!controller.signal.aborted) setError(message(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setPlanning(false);
      });
    return () => controller.abort();
  }, [project]);
  async function act(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  async function replaceWith(path: string) {
    if (
      project?.assessments.length &&
      !window.confirm(
        "Replace this tab’s project? Download a backup first if you want to keep it. Your Notion database will not be deleted.",
      )
    )
      return;
    await act(async () => {
      persist(await request<Project>(path));
      setTab("overview");
    });
  }
  function newAssessment() {
    setEditing({
      id: crypto.randomUUID(),
      module: "",
      title: "",
      kind: "Assignment",
      due_date: null,
      due_time: null,
      weight_percent: null,
      effort_minutes: 240,
      source_file: "Manual entry",
      source_page: null,
      evidence: "",
      notes: "",
      reviewed: false,
    });
  }
  if (!project || !config)
    return (
      <div className="loading-screen">
        <BrandMark />
        <h1 className="wordmark" aria-label="Crunch Week">
          <b>crunch</b>
          <span>week</span>
        </h1>
        <p role={error ? "alert" : "status"}>
          {error || "Making room for your semester…"}
        </p>
        {error && (
          <button
            className="button primary"
            onClick={() => window.location.reload()}
          >
            Retry connection
          </button>
        )}
      </div>
    );
  const count = project.assessments.filter((item) => !item.reviewed).length;
  const { semester_start, semester_end } = project.settings;
  const termDays = daysBetween(semester_start, semester_end) + 1;
  const elapsed = Math.min(
    Math.max(
      daysBetween(semester_start, todayIn(project.settings.timezone)) + 1,
      0,
    ),
    termDays,
  );
  return (
    <div className="app">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          aria-label="Crunch Week overview"
          onClick={(e) => {
            e.preventDefault();
            setTab("overview");
          }}
        >
          <BrandMark />
          <span className="wordmark" aria-hidden="true">
            <b>crunch</b>
            <span>week</span>
          </span>
        </a>
        <button className="semester" onClick={() => setModal("settings")}>
          <span className="semester-name">{project.name}</span>
          <span className="semester-dates">
            {dateLabel(semester_start)} – {dateLabel(semester_end)}
          </span>
          <Settings2 size={16} aria-hidden="true" />
          <span
            className="semester-progress"
            aria-hidden="true"
            style={
              {
                "--progress": `${termDays > 0 ? (elapsed / termDays) * 100 : 0}%`,
              } as CSSProperties
            }
          >
            <i />
          </span>
        </button>
        <nav className="nav" aria-label="Main navigation">
          {nav.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-current={tab === id ? "page" : undefined}
            >
              <Icon size={20} aria-hidden="true" />
              {label}
              {id === "assessments" && count > 0 && (
                <b className="nav-count">{count}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <button className="side-link" onClick={() => setModal("settings")}>
            <Settings2 size={18} aria-hidden="true" />
            Semester & availability
          </button>
          <div className="saved">
            <span className={`saved-state ${saved ? "is-saved" : ""}`}>
              <i aria-hidden="true" />
              {saved ? "Saved in this tab" : "In-memory session"}
            </span>
            <span className="saved-actions">
              <button
                className="icon-button"
                title="Download project backup"
                aria-label="Download project backup"
                onClick={() =>
                  saveBlob(
                    new Blob([JSON.stringify(project, null, 2)], {
                      type: "application/json",
                    }),
                    "crunch-week-project.json",
                  )
                }
              >
                <Download size={18} />
              </button>
              <button
                className="icon-button"
                title="Restore project backup"
                aria-label="Restore project backup"
                onClick={() => restoreInput.current?.click()}
              >
                <RotateCcw size={18} />
              </button>
            </span>
          </div>
        </div>
      </aside>
      <main className="main">
        <input
          className="sr-only"
          type="file"
          ref={restoreInput}
          accept=".json"
          aria-label="Project backup file"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            if (file.size > 2_000_000) {
              setError("Project backups must be smaller than 2 MB.");
              return;
            }
            if (
              project.assessments.length &&
              !window.confirm("Replace this tab’s project with the backup?")
            )
              return;
            await act(async () => {
              await validateAndSave(JSON.parse(await file.text()));
              setTab("overview");
            });
          }}
        />
        <div className="content">
          <header className="page-head">
            <div>
              <h1>
                {tab === "overview"
                  ? "See the busy weeks coming."
                  : tab === "assessments"
                    ? "The details, sorted."
                    : tab === "study"
                      ? "Make the work feel smaller."
                      : "From a plan to your everyday."}
              </h1>
              <p>
                {tab === "overview"
                  ? "Turn scattered deadlines into a semester you can handle."
                  : "A little clarity now. A lot less scrambling later."}
              </p>
            </div>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => {
                setModal("upload");
                setTab("assessments");
              }}
            >
              <Upload size={18} />
              Upload handbooks
            </button>
          </header>
          {error && (
            <div className="error global-error" role="alert">
              <span>{error}</span>
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={18} />
              </button>
            </div>
          )}
          {project.demo && (
            <div className="demo-banner">
              <span>
                <FlaskConical size={16} aria-hidden="true" />
                You're exploring a synthetic demo. These are not real university
                deadlines.
              </span>
              <button
                className="button secondary small"
                disabled={busy}
                onClick={() => replaceWith("/project/new")}
              >
                Start my semester
              </button>
            </div>
          )}
          {!project.assessments.length && tab === "overview" ? (
            <div className="view" key="welcome">
              <section className="welcome" aria-labelledby="welcome-title">
                <div className="welcome-copy">
                  <h2 id="welcome-title">
                    Three handbooks.
                    <br />
                    One clear semester.
                  </h2>
                  <p>
                    Let AI find the deadlines. Check the details. See the crunch
                    weeks and give your future self a plan.
                  </p>
                  <div className="welcome-actions">
                    <button
                      className="button primary"
                      onClick={() => setModal("upload")}
                    >
                      <Upload size={18} />
                      Upload your first handbook
                    </button>
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() => replaceWith("/demo")}
                    >
                      Explore the demo
                    </button>
                  </div>
                  <button className="text-link" onClick={newAssessment}>
                    <Plus size={16} />
                    Or add an assessment manually
                  </button>
                </div>
                <GhostStrip
                  start={semester_start}
                  weeks={Math.floor((termDays - 1) / 7) + 1}
                />
              </section>
              <ol className="steps">
                {[
                  ["Upload", "Bring your module outlines together."],
                  ["Review", "Check the dates against the source."],
                  ["Make a plan", "Find room for work before it piles up."],
                ].map(([title, copy]) => (
                  <li key={title}>
                    <h3>{title}</h3>
                    <p>{copy}</p>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <div className="view" key={tab}>
              {planning && (
                <p className="planning" role="status">
                  <span className="spinner" />
                  Updating your plan…
                </p>
              )}
              {tab === "overview" && result && (
                <Dashboard
                  key={project.id}
                  project={project}
                  result={result}
                  navigate={setTab}
                  edit={setEditing}
                />
              )}
              {tab === "assessments" && (
                <Assessments
                  project={project}
                  warnings={result?.warnings ?? []}
                  edit={setEditing}
                  add={newAssessment}
                  remove={(id) => {
                    if (
                      window.confirm(
                        "Remove this assessment? Its study blocks will be rebuilt.",
                      )
                    )
                      void act(() =>
                        validateAndSave({
                          ...project,
                          assessments: project.assessments.filter(
                            (item) => item.id !== id,
                          ),
                        }),
                      );
                  }}
                  approve={() => {
                    if (
                      window.confirm(
                        "Have you checked every assessment’s date, time and weighting against its official source? Unknown dates will stay unscheduled.",
                      )
                    )
                      void act(() =>
                        validateAndSave({
                          ...project,
                          assessments: project.assessments.map((item) => ({
                            ...item,
                            reviewed: true,
                          })),
                        }),
                      );
                  }}
                />
              )}
              {tab === "study" && result && (
                <StudyPlan
                  project={project}
                  result={result}
                  settings={() => setModal("settings")}
                />
              )}
              {tab === "notion" && (
                <NotionPanel
                  project={project}
                  config={config}
                  save={(target, id) => {
                    const current = projectRef.current;
                    if (!current || current.id !== id)
                      throw new Error(
                        "The active project changed. Restore the original project backup to reconnect this database.",
                      );
                    persist({ ...current, notion: target });
                  }}
                />
              )}
            </div>
          )}
          <footer className="footer">
            <span>Built for student life. Room for real life.</span>
            <span>
              Your time, thoughtfully planned · {project.settings.timezone}
            </span>
          </footer>
        </div>
      </main>
      {modal === "settings" && (
        <SettingsEditor
          project={project}
          close={() => setModal(null)}
          save={validateAndSave}
        />
      )}
      {modal === "upload" && (
        <UploadDialog
          project={project}
          config={config}
          close={() => {
            setModal(null);
            if (projectRef.current?.assessments.length) setTab("assessments");
          }}
          save={persist}
        />
      )}
      {editing && (
        <AssessmentEditor
          item={editing}
          close={() => setEditing(null)}
          save={async (item) => {
            const current = projectRef.current ?? project;
            const exists = current.assessments.some(
              (row) => row.id === item.id,
            );
            await validateAndSave({
              ...current,
              assessments: exists
                ? current.assessments.map((row) =>
                    row.id === item.id ? item : row,
                  )
                : [...current.assessments, item],
            });
          }}
        />
      )}
    </div>
  );
}

/** The empty semester, drawn in pencil before any deadline is added. */
function GhostStrip({ start, weeks }: { start: string; weeks: number }) {
  const count = Math.max(1, weeks);
  return (
    <figure className="ghost">
      <div
        className="ghost-strip"
        aria-hidden="true"
        data-dense={count > 16 ? "" : undefined}
        style={{ "--cols": count } as CSSProperties}
      >
        {Array.from({ length: count }, (_, i) => (
          <span className="ghost-week" key={i}>
            <i className="ghost-slot" />
            <i className="ghost-ruler" />
            <b>{i + 1}</b>
            <small>{dateLabel(addDays(start, i * 7))}</small>
          </span>
        ))}
      </div>
      <figcaption>
        Your {count} weeks from {dateLabel(start)}. Deadlines appear here, week
        by week, once you add them.
      </figcaption>
    </figure>
  );
}

function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect className="brand-mark-bg" width="32" height="32" rx="9" />
      <rect
        className="brand-mark-bar"
        x="6.5"
        y="18"
        width="3.5"
        height="6"
        rx="1"
      />
      <rect
        className="brand-mark-bar"
        x="11.75"
        y="14"
        width="3.5"
        height="10"
        rx="1"
      />
      <rect
        className="brand-mark-hot"
        x="17"
        y="7"
        width="3.5"
        height="17"
        rx="1"
      />
      <rect
        className="brand-mark-bar"
        x="22.25"
        y="19"
        width="3.5"
        height="5"
        rx="1"
      />
    </svg>
  );
}
