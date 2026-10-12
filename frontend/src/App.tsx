import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  CalendarClock,
  Moon,
  Sun,
  Sunrise,
  ChartNoAxesColumn,
  Download,
  FlaskConical,
  FolderOpen,
  ListChecks,
  MessageCircle,
  Plus,
  RotateCcw,
  Settings2,
  Share,
  Upload,
  X,
} from "lucide-react";
import type {
  Assessment,
  ChatProposal,
  CheckInStatus,
  Config,
  PlanResponse,
  Project,
  RecoveryOption,
  Settings,
  StudyAction,
  StudyBlock,
  Tab,
} from "./types";
import { message, request, saveBlob } from "./api";
import { Modal } from "./components/Modal";
import { Dashboard } from "./components/Dashboard";
import { Assessments } from "./components/Assessments";
import { AssessmentEditor } from "./components/AssessmentEditor";
import { SettingsEditor } from "./components/SettingsEditor";
import { UploadDialog } from "./components/UploadDialog";
import { StudyPlan } from "./components/StudyPlan";
import { NotionPanel } from "./components/NotionPanel";
import { addDays, dateLabel, daysBetween, todayIn } from "./utils";

import { CommitmentsDialog } from "./components/CommitmentsDialog";
import { RecoveryDialog } from "./components/RecoveryDialog";
import { FocusDock } from "./components/FocusDock";
import { readFocus } from "./focus";
import type { FocusSession } from "./focus";
import { Today } from "./components/Today";
import { ChatPanel } from "./components/ChatPanel";
import { SessionCheckIn } from "./components/SessionCheckIn";
import { assistantKey, planningKey } from "./planning";
import { loggedMinutes } from "./estimates";
import { readLibrary, storeProject } from "./storage";
const nav = [
  { id: "today", label: "Today", icon: Sunrise },
  { id: "overview", label: "Semester", icon: ChartNoAxesColumn },
  { id: "assessments", label: "Assessments", icon: ListChecks },
  { id: "study", label: "Study plan", icon: CalendarClock },
  { id: "notion", label: "Exports", icon: Share },
] as const;

export default function App() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      return localStorage.getItem("crunch-week-theme") === "dark"
        ? "dark"
        : "light";
    } catch {
      return "light";
    }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("crunch-week-theme", theme);
    } catch {
      /* Appearance still works without browser storage. */
    }
  }, [theme]);
  const [project, setProject] = useState<Project | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [result, setResult] = useState<PlanResponse | null>(null);
  const [tab, setTab] = useState<Tab>("today");
  const [modal, setModal] = useState<
    "settings" | "upload" | "library" | "recovery" | "commitments" | null
  >(null);
  const [editing, setEditing] = useState<Assessment | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [saved, setSaved] = useState(false);
  const [library, setLibrary] = useState<Project[]>([]);
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState("");
  const [recoveryUndo, setRecoveryUndo] = useState<{
    project_id: string;
    before: Settings;
    after: Settings;
  } | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState<{
    id: number;
    text: string;
  } | null>(null);
  function trainingChat() {
    setChatDraft({ id: Date.now(), text: "" });
    setChatOpen(true);
  }
  const [checkIn, setCheckIn] = useState<{
    project_id: string;
    activity_id: string;
  } | null>(null);
  const [focus, setFocus] = useState<FocusSession | null>(readFocus);
  const restoreInput = useRef<HTMLInputElement>(null);
  const projectRef = useRef<Project | null>(null);

  function persist(next: Project) {
    projectRef.current = next;
    setProject(next);
    try {
      const stored = storeProject(next);
      setLibrary(Object.values(stored.projects));
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
          const semesters = readLibrary();
          setLibrary(Object.values(semesters.projects));
          const activeProject = semesters.projects[semesters.active];
          stored = activeProject ? JSON.stringify(activeProject) : null;
        } catch {
          setError(
            "Saved browser data could not be read. A new semester is open; restore a downloaded backup if needed.",
          );
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
                "The saved semester could not be restored. Import a project backup, or start a new semester.",
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
  // Checklist and note edits do not affect scheduling. Keep the existing agenda
  // mounted while those changes save so keyboard/checkbox focus is preserved.
  const planKey = project ? planningKey(project) : "";
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
  }, [planKey, revision]);
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
    // Select the starting tab before loading: later navigation is the user's choice.
    setTab("today");
    await act(async () => {
      persist(await request<Project>(path));
    });
  }
  function handleStudy(action: StudyAction, blockId: string) {
    const current = projectRef.current;
    if (!current || !result) return;
    void act(async () => {
      const next = await request<Project>("/study/action", {
        project: current,
        action,
        block_id: blockId,
        planned_at: result.planned_at,
      });
      persist(next);
      if (action === "done")
        setCheckIn({ project_id: next.id, activity_id: blockId });
      if (action === "undo" && checkIn?.activity_id === blockId)
        setCheckIn(null);
      setNotice(
        action === "done"
          ? "Session logged. Your remaining work and plan have been updated."
          : action === "skipped"
            ? "Session moved. We’re finding another slot; any work that cannot fit will stay visible."
            : "Activity undone. Your plan has been rebuilt.",
      );
    });
  }
  function saveWorkResponse(snapshot: Project, next: Project) {
    const latest = projectRef.current;
    if (!latest || assistantKey(latest) !== assistantKey(snapshot))
      throw new Error(
        "Your plan changed in the app while this saved. Your edits were kept; review again.",
      );
    // Merge only the fields these endpoints can change, preserving note/task edits.
    persist({
      ...latest,
      settings: { ...latest.settings, commitments: next.settings.commitments },
      assessments: latest.assessments.map((item) => ({
        ...item,
        effort_minutes:
          next.assessments.find((row) => row.id === item.id)?.effort_minutes ??
          item.effort_minutes,
      })),
      study_history: next.study_history,
    });
  }
  async function applyAssistant(proposal: ChatProposal) {
    const current = projectRef.current;
    if (!current) return;
    setBusy(true);
    try {
      const next = await request<Project>("/assistant/apply", {
        project: current,
        proposal,
      });
      saveWorkResponse(current, next);
      setNotice("Reviewed changes applied. Your study plan is updating.");
    } finally {
      setBusy(false);
    }
  }
  async function saveCheckIn(
    status: CheckInStatus,
    remaining: number | null,
    expected: number,
  ) {
    const current = projectRef.current;
    if (!current || !checkIn || current.id !== checkIn.project_id)
      throw new Error("Open the session’s original semester first.");
    const activity = current.study_history.find(
      (row) => row.id === checkIn.activity_id,
    );
    if (!activity) throw new Error("This session was undone.");
    setBusy(true);
    try {
      const next = await request<Project>("/estimates/check-in", {
        project: current,
        assessment_id: activity.assessment_id,
        activity_id: activity.id,
        status,
        expected_remaining: expected,
        remaining_minutes: remaining,
      });
      saveWorkResponse(current, next);
      setNotice(
        status === "finished"
          ? "Study work finished. The submission deadline stays visible."
          : status === "need_more_time"
            ? "Remaining hours updated. Your plan will show what fits."
            : "Progress check saved. Your estimate is unchanged.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function applyRecovery(option: RecoveryOption) {
    const current = projectRef.current;
    if (!current) return;
    const next = await request<Project>("/recovery/apply", {
      project: current,
      option_id: option.id,
      expected_settings: option.settings,
    });
    persist(next);
    setRecoveryUndo({
      project_id: current.id,
      before: current.settings,
      after: next.settings,
    });
    setNotice(
      "Availability updated. Your plan is being rebuilt; you can undo this change below.",
    );
  }
  function undoRecovery() {
    const current = projectRef.current;
    if (
      !current ||
      !recoveryUndo ||
      current.id !== recoveryUndo.project_id ||
      JSON.stringify(current.settings) !== JSON.stringify(recoveryUndo.after)
    )
      return;
    void act(async () => {
      await validateAndSave({ ...current, settings: recoveryUndo.before });
      setRecoveryUndo(null);
      setNotice(
        "Availability change undone. Your study progress has been kept.",
      );
    });
  }
  function startFocus(block: StudyBlock) {
    if (!project || !result) return;
    if (
      focus &&
      !window.confirm(
        "Replace the current focus timer? Study progress stays recorded.",
      )
    )
      return;
    setFocus({
      project_id: project.id,
      block,
      planned_at: result.planned_at,
      elapsed_ms: 0,
      started_at: Date.now(),
    });
  }
  function finishFocus(session: FocusSession) {
    const current = projectRef.current;
    if (!current || current.id !== session.project_id) return;
    void act(async () => {
      const next = await request<Project>("/study/action", {
        project: current,
        action: "done",
        block_id: session.block.id,
        planned_at: session.planned_at,
      });
      persist(next);
      setFocus(null);
      setCheckIn({ project_id: next.id, activity_id: session.block.id });
      setNotice("Focus session logged. Your remaining work has been updated.");
    });
  }
  useEffect(() => {
    if (
      focus &&
      project?.id === focus.project_id &&
      project.study_history.some((row) => row.id === focus.block.id)
    )
      setFocus(null);
  }, [focus, project]);
  function toggleTask(assessmentId: string, taskId: string) {
    const current = projectRef.current;
    if (!current || busy) return;
    const next = {
      ...current,
      assessments: current.assessments.map((item) =>
        item.id === assessmentId
          ? {
              ...item,
              tasks: item.tasks.map((task) =>
                task.id === taskId ? { ...task, done: !task.done } : task,
              ),
            }
          : item,
      ),
    };
    // Show the tick immediately; rollback if validation or saving fails.
    projectRef.current = next;
    setProject(next);
    void act(async () => {
      try {
        await validateAndSave(next);
      } catch (err) {
        if (projectRef.current === next) {
          projectRef.current = current;
          setProject(current);
        }
        throw err;
      }
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
      completed: false,
      tasks: [],
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
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          aria-label="Crunch Week today"
          onClick={(e) => {
            e.preventDefault();
            setTab("today");
          }}
        >
          <BrandMark />
          <span className="wordmark" aria-hidden="true">
            <b>crunch</b>
            <span>week</span>
          </span>
        </a>
        <button
          className="semester"
          disabled={busy}
          onClick={() => setModal("settings")}
        >
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
        <div className="sidebar-caption">YOUR WORKSPACE</div>
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
          <button
            className="side-link"
            disabled={busy}
            onClick={() => setModal("settings")}
          >
            <Settings2 size={18} aria-hidden="true" />
            Semester & availability
          </button>
          <label className="field semester-library">
            Saved semesters
            <select
              aria-label="Saved semesters"
              value={project.id}
              disabled={busy}
              onChange={(e) => {
                const next = library.find((row) => row.id === e.target.value);
                if (next)
                  void act(async () => {
                    await validateAndSave(next);
                    setTab("today");
                    setNotice("");
                  });
              }}
            >
              {library.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                  {row.demo ? " · demo" : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            className="side-link"
            disabled={busy}
            onClick={() => replaceWith("/project/new")}
          >
            <Plus size={18} />
            New semester
          </button>
          <div className="saved">
            <span className={`saved-state ${saved ? "is-saved" : ""}`}>
              <i aria-hidden="true" />
              {saved ? "Saved on this device" : "In-memory session"}
            </span>
            <span className="saved-actions">
              <button
                className="icon-button theme-toggle"
                onClick={() => setTheme(theme === "light" ? "dark" : "light")}
                title={
                  theme === "light"
                    ? "Switch to dark theme"
                    : "Switch to light theme"
                }
                aria-label={
                  theme === "light"
                    ? "Switch to dark theme"
                    : "Switch to light theme"
                }
              >
                {theme === "light" ? (
                  <Moon size={18} aria-hidden="true" />
                ) : (
                  <Sun size={18} aria-hidden="true" />
                )}
              </button>
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
      <main className="main" id="main-content" tabIndex={-1}>
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
              !window.confirm(
                "Open this backup? Your other semesters stay saved on this device.",
              )
            )
              return;
            setTab("today");
            await act(async () => {
              await validateAndSave(JSON.parse(await file.text()));
            });
          }}
        />
        <div className="content">
          <header className="page-head">
            <div>
              <span className="page-eyebrow">
                {tab === "today"
                  ? "Today"
                  : tab === "overview"
                    ? "Semester overview"
                    : tab === "assessments"
                      ? "Assessments"
                      : tab === "study"
                        ? "Study plan"
                        : "Exports & integrations"}
              </span>
              <h1>
                {tab === "today"
                  ? "Your study day"
                  : tab === "overview"
                    ? "Your semester"
                    : tab === "assessments"
                      ? "Your assessments"
                      : tab === "study"
                        ? "Your study plan"
                        : "Calendars & backups"}
              </h1>
              <p>
                {tab === "today"
                  ? "See your next task, log progress and adjust around work or training."
                  : tab === "overview"
                    ? "Spot deadline clashes and weeks with more work than available time."
                    : tab === "assessments"
                      ? "Check deadlines against the source and estimate the work still to do."
                      : tab === "study"
                        ? "Sessions fit your available hours. Log or move them when plans change."
                        : "Take your schedule to your calendar and keep a copy of your semester."}
              </p>
            </div>
            <div className="page-actions">
              <button
                className="button secondary"
                aria-expanded={chatOpen}
                onClick={() => setChatOpen((value) => !value)}
              >
                <MessageCircle size={18} />
                Planner chat
              </button>
              <button
                className="button secondary library-action"
                title="Saved semesters"
                disabled={busy}
                onClick={() => setModal("library")}
              >
                <FolderOpen size={18} aria-hidden="true" />
                <span className="compact-action-label">Semesters</span>
              </button>
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
            </div>
          </header>
          {checkIn?.project_id === project.id && (
            <SessionCheckIn
              key={`${project.id}-${checkIn.activity_id}`}
              project={project}
              activityId={checkIn.activity_id}
              close={() => setCheckIn(null)}
              save={saveCheckIn}
              busy={busy}
            />
          )}
          {notice && (
            <div className="notice success" role="status">
              <span>{notice}</span>
              <button
                className="icon-button"
                aria-label="Dismiss update"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {recoveryUndo?.project_id === project.id &&
            JSON.stringify(project.settings) ===
              JSON.stringify(recoveryUndo.after) && (
              <div className="notice recovery-undo">
                <span>Changed your mind about this availability change?</span>
                <button
                  className="button secondary small"
                  disabled={busy}
                  onClick={undoRecovery}
                >
                  Undo availability change
                </button>
              </div>
            )}
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
          {!project.assessments.length &&
          (tab === "overview" || tab === "today") ? (
            <div className="view" key="welcome">
              <section className="welcome" aria-labelledby="welcome-title">
                <div className="welcome-copy">
                  <h2 id="welcome-title">
                    Your deadlines.
                    <br />
                    Your life. One plan.
                  </h2>
                  <p>
                    Start with your free hours, add your assessments, and find
                    out what fits before the busy weeks arrive.
                  </p>
                  <div className="welcome-actions">
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() => setModal("settings")}
                    >
                      <Settings2 size={18} />
                      Set my study hours
                    </button>
                    <button className="button secondary" onClick={trainingChat}>
                      <MessageCircle size={18} />
                      Add training with chat
                    </button>
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
                  ["Make space", "Protect lectures, shifts and days off."],
                  [
                    "Add your work",
                    "Upload a handbook or enter a deadline. Check the source.",
                  ],
                  [
                    "Stay on track",
                    "See what to do next and recover when plans change.",
                  ],
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
              {tab === "today" && result && (
                <Today
                  project={project}
                  result={result}
                  busy={busy}
                  action={handleStudy}
                  focus={startFocus}
                  navigate={setTab}
                  edit={setEditing}
                  toggleTask={toggleTask}
                  checkProgress={(activity_id) =>
                    setCheckIn({ project_id: project.id, activity_id })
                  }
                  settings={() => setModal("settings")}
                  recover={() => setModal("recovery")}
                  commitments={() => setModal("commitments")}
                  chat={trainingChat}
                  refresh={() => {
                    setRevision((n) => n + 1);
                    setNotice(
                      "Your plan is rebuilding around the hours still available.",
                    );
                  }}
                  submit={(item) => {
                    if (
                      !window.confirm(
                        `Mark “${item.title}” submitted? Remaining study sessions for it will be removed.`,
                      )
                    )
                      return;
                    void act(async () => {
                      await validateAndSave({
                        ...project,
                        assessments: project.assessments.map((row) =>
                          row.id === item.id
                            ? { ...row, completed: true }
                            : row,
                        ),
                      });
                      setNotice(
                        "Assessment marked submitted. You can reopen it in the assessment editor.",
                      );
                    });
                  }}
                />
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
                  recover={() => setModal("recovery")}
                  action={handleStudy}
                  focus={startFocus}
                  busy={busy}
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
      <FocusDock
        session={focus}
        project={project}
        busy={busy}
        change={setFocus}
        complete={finishFocus}
        openProject={(id) => {
          const saved = library.find((row) => row.id === id);
          if (saved)
            void act(async () => {
              await validateAndSave(saved);
              setTab("today");
            });
          else
            setError(
              "Restore the original semester backup to continue this focus session.",
            );
        }}
      />
      <ChatPanel
        key={project.id}
        project={project}
        config={config}
        draft={chatDraft}
        open={chatOpen}
        close={() => setChatOpen(false)}
        apply={applyAssistant}
        busy={busy}
      />
      {modal === "library" && (
        <Modal title="Your semesters" close={() => setModal(null)} busy={busy}>
          <p className="muted">
            Saved in this browser on this device. Download a backup to move to
            another device or keep a separate copy.
          </p>
          <ul className="library-list">
            {library.map((row) => (
              <li key={row.id}>
                <button
                  className="library-open"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await validateAndSave(row);
                      setModal(null);
                      setTab("today");
                      setNotice("");
                    })
                  }
                >
                  <strong>
                    {row.name}
                    {row.demo ? " · demo" : ""}
                  </strong>
                  <small>
                    {dateLabel(row.settings.semester_start)} –{" "}
                    {dateLabel(row.settings.semester_end)} ·{" "}
                    {row.assessments.length} assessments
                  </small>
                  {row.id === project.id && <span className="chip">Open</span>}
                </button>
                <button
                  className="icon-button"
                  aria-label={`Download backup of ${row.name}`}
                  onClick={() =>
                    saveBlob(
                      new Blob([JSON.stringify(row, null, 2)], {
                        type: "application/json",
                      }),
                      "crunch-week-project.json",
                    )
                  }
                >
                  <Download size={18} />
                </button>
              </li>
            ))}
          </ul>
          <div className="modal-actions">
            <button
              className="button primary"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  persist(await request<Project>("/project/new"));
                  setModal(null);
                  setTab("today");
                })
              }
            >
              <Plus size={18} />
              New semester
            </button>
          </div>
        </Modal>
      )}
      {modal === "settings" && (
        <SettingsEditor
          project={project}
          close={() => setModal(null)}
          save={async (next) => {
            const current = projectRef.current ?? next;
            await validateAndSave({
              ...current,
              name: next.name,
              settings: next.settings,
            });
          }}
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
          addManually={() => {
            setModal(null);
            setTab("assessments");
            newAssessment();
          }}
        />
      )}
      {modal === "commitments" && (
        <CommitmentsDialog
          project={project}
          close={() => setModal(null)}
          save={async (next) => {
            const current = projectRef.current ?? next;
            await validateAndSave({ ...current, settings: next.settings });
            setNotice(
              "Commitments saved. Your study plan is adjusting around them.",
            );
          }}
        />
      )}
      {modal === "recovery" && (
        <RecoveryDialog
          project={project}
          close={() => setModal(null)}
          apply={applyRecovery}
          settings={() => setModal("settings")}
          review={() => {
            setModal(null);
            setTab("assessments");
          }}
        />
      )}
      {editing && (
        <AssessmentEditor
          item={editing}
          projects={[
            ...library.filter((row) => row.id !== project.id),
            project,
          ]}
          projectId={project.id}
          alreadyLogged={loggedMinutes(project, editing)}
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
