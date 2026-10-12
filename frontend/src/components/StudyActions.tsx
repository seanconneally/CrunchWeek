import { Check, SkipForward, Timer } from "lucide-react";
import type { StudyAction, StudyBlock } from "../types";

export function StudyActions({
  block,
  busy,
  action,
  focus,
}: {
  block: StudyBlock;
  busy: boolean;
  action: (action: StudyAction, id: string) => void;
  focus: (block: StudyBlock) => void;
}) {
  return (
    <div className="session-actions">
      <button
        className="button primary small"
        disabled={busy}
        onClick={() => focus(block)}
        aria-label={`Focus: ${block.title} at ${block.start.slice(11, 16)}`}
      >
        <Timer size={16} />
        Start focus
      </button>
      <button
        className="button secondary small"
        disabled={busy}
        onClick={() => action("done", block.id)}
        aria-label={`Done: ${block.title} at ${block.start.slice(11, 16)}`}
      >
        <Check size={16} />
        Done
      </button>
      <button
        className="button secondary small"
        disabled={busy}
        onClick={() => action("skipped", block.id)}
        aria-label={`Move: ${block.title} at ${block.start.slice(11, 16)}`}
      >
        <SkipForward size={16} />
        Move this session
      </button>
    </div>
  );
}
