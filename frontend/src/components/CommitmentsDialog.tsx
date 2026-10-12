import { useState } from "react";
import type { Project } from "../types";
import { message } from "../api";
import { Modal } from "./Modal";
import { ProtectedTime } from "./ProtectedTime";
export function CommitmentsDialog({
  project,
  close,
  save,
}: {
  project: Project;
  close: () => void;
  save: (project: Project) => Promise<void>;
}) {
  const [settings, setSettings] = useState(project.settings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal title="Keep time for your life" close={close} busy={busy}>
      <p className="muted">
        Your study plan will work around these commitments. If there is too much
        work left, you will see what cannot fit.
      </p>
      <form
        className="stack-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await save({ ...project, settings });
            close();
          } catch (err) {
            setError(message(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <ProtectedTime
          settings={settings}
          change={(patch) => setSettings((old) => ({ ...old, ...patch }))}
          commitmentsOnly
        />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : "Save commitments & rebuild"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
