import type { StudyBlock } from "./types";
export const FOCUS_KEY = "crunch-week-focus-v1";
export interface FocusSession {
  project_id: string;
  block: StudyBlock;
  planned_at: string;
  elapsed_ms: number;
  started_at: number | null;
}
export function focusElapsed(session: FocusSession, now = Date.now()): number {
  const running =
    session.started_at === null ? 0 : Math.max(0, now - session.started_at);
  return Math.min(session.block.minutes * 60000, session.elapsed_ms + running);
}
export function readFocus(): FocusSession | null {
  try {
    const raw = localStorage.getItem(FOCUS_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as FocusSession;
    if (
      !value ||
      typeof value.project_id !== "string" ||
      !Number.isFinite(Date.parse(value.planned_at)) ||
      !value.block ||
      typeof value.block.id !== "string" ||
      typeof value.block.title !== "string" ||
      !Number.isFinite(value.block.minutes) ||
      value.block.minutes < 30 ||
      value.block.minutes > 120 ||
      !Number.isFinite(value.elapsed_ms) ||
      value.elapsed_ms < 0 ||
      value.elapsed_ms > value.block.minutes * 60000 ||
      (value.started_at !== null &&
        (!Number.isFinite(value.started_at) || value.started_at < 0))
    )
      return null;
    return value;
  } catch {
    return null;
  }
}
