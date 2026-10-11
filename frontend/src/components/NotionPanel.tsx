import { useState } from "react";
import {
  ArrowUpRight,
  CircleCheck,
  Download,
  FileSearch,
  Info,
  RefreshCw,
} from "lucide-react";
import type { Config, NotionTarget, Project } from "../types";
import { download, message, request, saveBlob } from "../api";

export function NotionPanel({
  project,
  config,
  save,
}: {
  project: Project;
  config: Config;
  save: (target: NotionTarget, projectId: string) => void;
}) {
  const [parent, setParent] = useState("");
  const [database, setDatabase] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const ready =
    project.assessments.length > 0 &&
    project.assessments.every((item) => item.reviewed);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await action();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="notion-grid">
      <section className="panel notion" aria-labelledby="notion-title">
        <div className="notion-head">
          <span className="notion-mark" aria-hidden="true">
            N
          </span>
          <div>
            <h2 id="notion-title">Send it to Notion.</h2>
            <p>
              One database. A semester calendar, a deadlines table, and a study
              plan. Repeat syncs update the same entries.
            </p>
          </div>
        </div>
        {!config.notion_configured && (
          <div className="notice">
            <Info size={18} aria-hidden="true" />
            <span>
              Set <code>NOTION_TOKEN</code> in the backend <code>.env</code>{" "}
              file and restart. In Notion, share your parent page with that
              connection and grant read, insert and update access.
            </span>
          </div>
        )}
        {project.notion ? (
          <>
            <div className="connection">
              <CircleCheck size={20} aria-hidden="true" />
              <div>
                <strong>Database connected</strong>
                <small>{project.notion.database_id}</small>
              </div>
              <a
                className="icon-button"
                href={`https://www.notion.so/${project.notion.database_id.replaceAll("-", "")}`}
                target="_blank"
                rel="noreferrer"
                aria-label="Open Notion database"
              >
                <ArrowUpRight size={20} />
              </a>
            </div>
            {!ready && (
              <p className="pencil-note">
                <FileSearch size={18} aria-hidden="true" />
                Add and review every assessment before syncing.
              </p>
            )}
            <p className="small muted">
              Sync writes reviewed assessments, source excerpts and study blocks
              to this database. It updates app-managed fields, preserves “Done”,
              and marks removed items as superseded. Save a project backup to
              reconnect later.
            </p>
            <div>
              <button
                className="button primary"
                disabled={busy || !ready || !config.notion_configured}
                onClick={() =>
                  run(async () => {
                    const result = await request<{
                      created: number;
                      updated: number;
                      superseded: number;
                      warnings: string[];
                      error: string | null;
                    }>("/notion/sync", project);
                    setStatus(
                      `${result.created} created · ${result.updated} updated · ${result.superseded} superseded. ${result.warnings.join(" ")}`,
                    );
                    if (result.error)
                      setError(
                        `Sync stopped after the completed changes above. ${result.error} Retry to continue safely.`,
                      );
                  })
                }
              >
                <RefreshCw size={18} className={busy ? "spin" : ""} />
                {busy ? "Syncing…" : "Sync to Notion"}
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="field">
              Parent page link or ID
              <input
                placeholder="https://www.notion.so/your-page…"
                value={parent}
                onChange={(e) => setParent(e.target.value)}
              />
            </label>
            {config.parent_configured && (
              <p className="small muted">
                Leave blank to use the parent page configured on the backend.
              </p>
            )}
            <div>
              <button
                className="button primary"
                disabled={
                  busy ||
                  !config.notion_configured ||
                  (!parent && !config.parent_configured)
                }
                onClick={() =>
                  run(async () => {
                    const target = await request<NotionTarget>(
                      "/notion/create",
                      {
                        project,
                        parent_page: parent,
                      },
                    );
                    save(target, project.id);
                    setStatus(
                      "Database created. Sync when your assessments are reviewed.",
                    );
                  })
                }
              >
                {busy ? "Connecting…" : "Create semester database"}
              </button>
            </div>
            <details className="reconnect">
              <summary>Reconnect an existing Crunch Week database</summary>
              <div className="reconnect-body">
                <p className="small muted">
                  Restore the original project backup first to preserve its
                  identity and avoid duplicates.
                </p>
                <label className="field">
                  Database link or ID
                  <input
                    value={database}
                    onChange={(e) => setDatabase(e.target.value)}
                  />
                </label>
                <div>
                  <button
                    className="button secondary"
                    disabled={busy || !database || !config.notion_configured}
                    onClick={() =>
                      run(async () => {
                        const target = await request<NotionTarget>(
                          "/notion/connect",
                          { database },
                        );
                        save(target, project.id);
                        setStatus("Connected.");
                      })
                    }
                  >
                    Connect database
                  </button>
                </div>
              </div>
            </details>
          </>
        )}
        {busy && (
          <p role="status" className="muted small">
            Notion limits request speed. Larger plans may take a few minutes.
            Keep this tab open.
          </p>
        )}
        {status && (
          <p role="status" className="notice success">
            <CircleCheck size={18} aria-hidden="true" />
            {status}
          </p>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </section>
      <section className="panel exports" aria-labelledby="exports-title">
        <div>
          <h2 id="exports-title">Good plans travel.</h2>
          <p className="muted">No integration needed for these downloads.</p>
        </div>
        <div className="export-list">
          <button
            className="export-card"
            disabled={busy || !ready}
            onClick={() => run(() => download("ics", project))}
          >
            <span className="file-symbol">ICS</span>
            <span>
              <strong>Calendar (.ics)</strong>
              <small>Reviewed deadlines + study blocks</small>
            </span>
            <Download size={20} />
          </button>
          {!ready && (
            <p className="export-hint">
              Available once every assessment is reviewed.
            </p>
          )}
          <button
            className="export-card"
            disabled={busy}
            onClick={() => run(() => download("csv", project))}
          >
            <span className="file-symbol">CSV</span>
            <span>
              <strong>Assessment spreadsheet</strong>
              <small>All entries, including review status</small>
            </span>
            <Download size={20} />
          </button>
          <button
            className="export-card"
            disabled={busy}
            onClick={() =>
              saveBlob(
                new Blob([JSON.stringify(project, null, 2)], {
                  type: "application/json",
                }),
                "crunch-week-project.json",
              )
            }
          >
            <span className="file-symbol">{`{ }`}</span>
            <span>
              <strong>Project backup</strong>
              <small>Restore edits, settings and Notion IDs</small>
            </span>
            <Download size={20} />
          </button>
        </div>
        <p className="small muted">
          Calendar files are snapshots. Re-import behavior varies by calendar
          app; replace the old imported calendar when rebuilding. Backups
          contain assessment details and excerpts, never API keys.
        </p>
      </section>
    </div>
  );
}
