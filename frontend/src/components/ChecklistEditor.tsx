import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Task } from "../types";

export function ChecklistEditor({
  tasks,
  change,
}: {
  tasks: Task[];
  change: (value: Task[]) => void;
}) {
  const [title, setTitle] = useState("");
  const add = () => {
    if (!title.trim() || tasks.length >= 30) return;
    change([
      ...tasks,
      { id: crypto.randomUUID(), title: title.trim(), done: false },
    ]);
    setTitle("");
  };
  return (
    <fieldset className="form-section checklist-editor">
      <legend>Break it into steps</legend>
      <p className="muted small">
        A clear next step helps you start. Checklist ticks do not reduce your
        remaining work estimate.
      </p>
      <ul>
        {tasks.map((task) => (
          <li key={task.id}>
            <label className="check-row">
              <input
                type="checkbox"
                checked={task.done}
                onChange={(e) =>
                  change(
                    tasks.map((row) =>
                      row.id === task.id
                        ? { ...row, done: e.target.checked }
                        : row,
                    ),
                  )
                }
              />
              <span className={task.done ? "task-done" : ""}>{task.title}</span>
            </label>
            <button
              className="icon-button"
              type="button"
              aria-label={`Remove step ${task.title}`}
              onClick={() => change(tasks.filter((row) => row.id !== task.id))}
            >
              <Trash2 size={16} />
            </button>
          </li>
        ))}
      </ul>
      <div className="task-entry">
        <input
          aria-label="New checklist step"
          placeholder="e.g. Find three useful sources"
          maxLength={160}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button
          type="button"
          className="button secondary small"
          disabled={!title.trim() || tasks.length >= 30}
          onClick={add}
        >
          <Plus size={16} />
          Add step
        </button>
      </div>
      {!tasks.length && (
        <button
          className="text-link"
          type="button"
          onClick={() =>
            change(
              [
                "Read the brief and marking criteria",
                "Gather sources and materials",
                "Complete the first draft",
                "Review and submit",
              ].map((title) => ({
                id: crypto.randomUUID(),
                title,
                done: false,
              })),
            )
          }
        >
          Use a starter checklist
        </button>
      )}
    </fieldset>
  );
}
