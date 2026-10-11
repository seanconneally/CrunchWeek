import { useState } from "react";
import type { CSSProperties } from "react";
import {
  Check,
  CheckCheck,
  FileSearch,
  Pencil,
  Plus,
  Search,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import type { Assessment, Project } from "../types";
import { dateLabel, moduleColor } from "../utils";

export function Assessments({
  project,
  edit,
  add,
  remove,
  approve,
  warnings,
}: {
  project: Project;
  edit: (item: Assessment) => void;
  add: () => void;
  remove: (id: string) => void;
  approve: () => void;
  warnings: string[];
}) {
  const [search, setSearch] = useState("");
  const [onlyUnreviewed, setOnlyUnreviewed] = useState(false);
  const items = project.assessments.filter(
    (item) =>
      `${item.title} ${item.module}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (!onlyUnreviewed || !item.reviewed),
  );
  const total = project.assessments.length;
  const reviewed = project.assessments.filter((item) => item.reviewed).length;
  return (
    <section className="panel assessments" aria-labelledby="assessments-title">
      <div className="panel-head">
        <div>
          <h2 id="assessments-title">Every deadline. In one place.</h2>
          <p>
            Open an assessment to check its source, correct the details, and
            estimate your remaining work.
          </p>
        </div>
        <button className="button primary" onClick={add}>
          <Plus size={18} />
          Add assessment
        </button>
      </div>
      {total > 0 && (
        <div className="review-meter">
          <span
            className="review-meter-bar"
            aria-hidden="true"
            style={
              { "--done": `${(reviewed / total) * 100}%` } as CSSProperties
            }
          >
            <i />
          </span>
          <span>
            <strong>
              {reviewed} of {total}
            </strong>{" "}
            reviewed against the source
          </span>
        </div>
      )}
      <div className="table-toolbar">
        <label className="search">
          <Search size={18} aria-hidden="true" />
          <input
            aria-label="Search assessments"
            placeholder="Search modules or assessments…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={onlyUnreviewed}
            onChange={(e) => setOnlyUnreviewed(e.target.checked)}
          />
          Needs review only
        </label>
      </div>
      <div className="table-wrap">
        <table className="assessment-table">
          <thead>
            <tr>
              <th>Assessment / module</th>
              <th>Deadline</th>
              <th>Weight</th>
              <th>Work left</th>
              <th>Review</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                className={item.reviewed ? "is-inked" : "is-pencil"}
              >
                <td className="cell-title">
                  <button className="table-title" onClick={() => edit(item)}>
                    {item.title}
                  </button>
                  <span className="module-label">
                    <i
                      className="dot"
                      style={
                        {
                          "--module": moduleColor(item.module),
                        } as CSSProperties
                      }
                    />
                    {item.module}
                  </span>
                </td>
                <td className={`cell-due ${item.due_date ? "" : "is-unknown"}`}>
                  <span className="due-date">{dateLabel(item.due_date)}</span>
                  <small className="due-time">
                    {item.due_time?.slice(0, 5) ||
                      (item.due_date ? "Time not specified" : "Check source")}
                  </small>
                </td>
                <td
                  className={`cell-weight ${item.weight_percent === null ? "is-unknown" : ""}`}
                >
                  <span className="cell-label" aria-hidden="true">
                    Weight
                  </span>
                  {item.weight_percent === null
                    ? "Unknown"
                    : `${item.weight_percent}%`}
                </td>
                <td className="cell-effort">
                  <span className="cell-label" aria-hidden="true">
                    Work left
                  </span>
                  {item.effort_minutes / 60}h
                </td>
                <td className="cell-review">
                  <span
                    className={`chip ${item.reviewed ? "inked" : "pencil"}`}
                  >
                    {item.reviewed ? (
                      <Check size={15} aria-hidden="true" />
                    ) : (
                      <FileSearch size={15} aria-hidden="true" />
                    )}
                    {item.reviewed ? "Reviewed" : "Check source"}
                  </span>
                </td>
                <td className="cell-actions">
                  <div className="row-actions">
                    <button
                      className="icon-button"
                      aria-label={`Edit ${item.title}`}
                      onClick={() => edit(item)}
                    >
                      <Pencil size={17} />
                    </button>
                    <button
                      className="icon-button danger"
                      aria-label={`Remove ${item.title}`}
                      onClick={() => remove(item.id)}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!items.length && (
        <p className="empty-small">
          No assessments match. Upload a handbook or add one manually.
        </p>
      )}
      {project.assessments.some((item) => !item.reviewed) && (
        <div className="bulk-review">
          <p>Already checked every entry against your handbooks?</p>
          <button className="button secondary" onClick={approve}>
            <CheckCheck size={18} />
            Mark all as reviewed
          </button>
        </div>
      )}
      {warnings.length > 0 && (
        <details className="notice">
          <summary>
            <TriangleAlert size={18} aria-hidden="true" />
            {warnings.length} detail{warnings.length > 1 ? "s" : ""} to check
          </summary>
          <ul>
            {warnings.map((warning, i) => (
              <li key={i}>{warning}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
