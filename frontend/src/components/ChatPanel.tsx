import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import type {
  ChatMessage,
  ChatProposal,
  ChatUsage,
  Config,
  Project,
} from "../types";
import { assistantKey } from "../planning";
import { message, request } from "../api";
import { dateLabel } from "../utils";
const localQuestion = (text: string) =>
  /^(how|where|what|can you explain|explain|help|why|show me)\b/i.test(
    text.trim(),
  ) &&
  /(app|crunch week|upload|import|extract|handbook|pdf|document|focus|timer|pause|resume|checklist|steps|tick|export|backup|restore|notion|calendar|ics|csv|semester|switch|device|sync|account|training|work shift|commitment|lecture|class|make room|unscheduled|shortfall|on track|need more time|finished|done|progress|undo|log|remaining|submit|availability|study hours|free hours|goal|assessment|deadline|review|weight|source|limit|quota|cost)/i.test(
    text,
  ) &&
  !/write (?:me |my |an? )?(?:essay|report|assignment)|solve|homework|ignore .*instructions/i.test(
    text,
  );
const days = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const hours = (minutes: number) =>
  new Intl.NumberFormat("en-IE", { maximumFractionDigits: 1 }).format(
    minutes / 60,
  );
export function ChatPanel({
  project,
  config,
  open,
  close,
  apply,
  busy: parentBusy,
  draft,
}: {
  project: Project;
  config: Config;
  open: boolean;
  close: () => void;
  apply: (proposal: ChatProposal) => Promise<void>;
  busy: boolean;
  draft?: { id: number; text: string } | null;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const lastDraft = useRef<number | null>(null);
  const chatConfigured = config.chat_configured ?? config.ai_configured;
  const chatProvider = config.chat_provider_name ?? config.ai_provider_name;
  useEffect(() => {
    if (open && draft && lastDraft.current !== draft.id) {
      lastDraft.current = draft.id;
      setText(draft.text);
      input.current?.focus();
    }
  }, [open, draft]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversation, setConversation] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [consent, setConsent] = useState(false);
  const [proposal, setProposal] = useState<ChatProposal | null>(null);
  const [preparedKey, setPreparedKey] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [usage, setUsage] = useState<ChatUsage | null>(null);
  async function refreshUsage() {
    try {
      setUsage(await request<ChatUsage>("/assistant/usage"));
    } catch (err) {
      setError(message(err));
      setUsage(null);
    }
  }
  useEffect(() => {
    if (!open) return;
    void refreshUsage();
    const interval = window.setInterval(() => {
      void refreshUsage();
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [open]);
  const helpOnly = localQuestion(text);
  const quotaReached = usage?.remaining === 0;

  const stale =
    !!proposal &&
    (preparedKey !== assistantKey(project) ||
      Date.now() - new Date(proposal.created_at).getTime() > 15 * 60_000);
  const changes =
    (proposal?.commitment_changes.length || 0) +
    (proposal?.effort_changes.length || 0);
  async function send(question?: string) {
    const content = (question || text).trim();
    if (
      !content ||
      busy ||
      parentBusy ||
      !usage ||
      quotaReached ||
      (!localQuestion(content) && (!consent || !chatConfigured))
    )
      return;
    const next: ChatMessage[] = [
      ...(stale ? [] : conversation),
      { role: "user" as const, content },
    ].slice(-12);
    const snapshot = assistantKey(project);
    setMessages((old) =>
      [...old, { role: "user" as const, content }].slice(-30),
    );
    setText("");
    setError("");
    setBusy(true);
    try {
      const response = await request<ChatProposal>("/assistant/propose", {
        project,
        expected_provider: config.chat_provider,
        messages: next,
        consent,
      });
      const reply: ChatMessage = {
        role: "assistant",
        content: [response.message, ...response.questions]
          .filter((line, index, all) => line && all.indexOf(line) === index)
          .join("\n"),
      };
      setMessages((old) => [...old, reply].slice(-30));
      setConversation([...next, reply].slice(-11));
      if (response.usage) setUsage(response.usage);
      if (
        response.commitment_changes.length ||
        response.effort_changes.length ||
        response.questions.length
      ) {
        setProposal(response);
        setPreparedKey(snapshot);
        setDirty(false);
      }
    } catch (err) {
      setError(message(err));
      setText(content);
    } finally {
      setBusy(false);
      await refreshUsage();
    }
  }
  function patchEffort(index: number, minutes: number) {
    setProposal((old) =>
      old
        ? {
            ...old,
            effort_changes: old.effort_changes.map((row, i) =>
              i === index ? { ...row, after_minutes: minutes } : row,
            ),
          }
        : old,
    );
    setDirty(true);
  }
  function patchCommitment(index: number, patch: Record<string, unknown>) {
    setProposal((old) =>
      old
        ? {
            ...old,
            commitment_changes: old.commitment_changes.map((row, i) =>
              i === index && row.after
                ? { ...row, after: { ...row.after, ...patch } }
                : row,
            ),
          }
        : old,
    );
    setDirty(true);
  }
  return (
    <aside className="chat-panel" aria-label="Planner chat" hidden={!open}>
      {open && (
        <>
          <header className="chat-head">
            <div>
              <MessageCircle size={19} />
              <h2>Your study planner</h2>
            </div>
            <button
              className="icon-button"
              aria-label="Close planner chat"
              onClick={close}
            >
              <X size={19} />
            </button>
          </header>
          <div className="chat-scroll">
            {config.chat_local && (
              <p className="chat-local-note small">
                Local model · {config.chat_model || "not ready"} · no paid API
                calls
              </p>
            )}
            <p className="small muted">
              Scheduling changes and help using Crunch Week. Describe
              work/training times or remaining study hours, or ask where to find
              a feature. Changes need your confirmation; direct app edits take
              priority.
            </p>
            {!messages.length && (
              <div className="chat-example">
                <p>
                  Tell me your training days and times. Weekly training repeats
                  automatically after you confirm.
                </p>
                <button
                  className="text-link"
                  onClick={() => {
                    setText(
                      "I have training every Tuesday and Thursday from 18:00 to 20:00.",
                    );
                    input.current?.focus();
                  }}
                >
                  Example: training Tuesdays & Thursdays, 6–8pm
                </button>
                <p>Or describe a work shift:</p>
                <button
                  className="text-link"
                  onClick={() =>
                    setText("I work every Friday from 17:00 to 21:00.")
                  }
                >
                  “I work every Friday from 17:00 to 21:00.”
                </button>
                <p>
                  Schedule changes are reviewed before applying. Coursework
                  writing and general questions are outside this chat.
                </p>
              </div>
            )}
            <div
              className="chat-help-shortcuts"
              aria-label="App help shortcuts"
            >
              {[
                "Where do I set my free hours?",
                "How do I upload a document?",
              ].map((question) => (
                <button
                  key={question}
                  className="text-link"
                  disabled={busy || parentBusy || !usage || quotaReached}
                  onClick={() => {
                    void send(question);
                  }}
                >
                  {question}
                </button>
              ))}
            </div>
            {!!messages.length && (
              <ol className="chat-messages" aria-live="polite">
                {messages.map((row, i) => (
                  <li key={i} className={`chat-message is-${row.role}`}>
                    <small>{row.role === "user" ? "You" : "Crunch Week"}</small>
                    <p>{row.content}</p>
                  </li>
                ))}
              </ol>
            )}
            {busy && (
              <p role="status" className="planning">
                <span className="spinner" />
                {proposal ? "Checking the changes…" : "Preparing a proposal…"}
              </p>
            )}
            {stale && (
              <p className="notice">
                Your plan changed or this preview expired. App edits have been
                kept. Describe any changes you still want in a new message.
              </p>
            )}
            {proposal && changes > 0 && (
              <form
                className="chat-proposal"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  setError("");
                  try {
                    if (dirty) {
                      const reviewed = await request<ChatProposal>(
                        "/assistant/review",
                        { project, proposal },
                      );
                      setProposal(reviewed);
                      setPreparedKey(assistantKey(project));
                      setDirty(false);
                    } else {
                      await apply(proposal);
                      setProposal(null);
                      setConversation([]);
                      setMessages((old) =>
                        [
                          ...old,
                          {
                            role: "assistant" as const,
                            content:
                              "Confirmed. Your study plan is being rebuilt around the reviewed changes.",
                          },
                        ].slice(-30),
                      );
                    }
                  } catch (err) {
                    setError(message(err));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <h3>Review proposed changes</h3>
                {proposal.commitment_changes.map((row, index) => (
                  <fieldset
                    className="chat-change"
                    key={index}
                    disabled={busy || stale || parentBusy}
                  >
                    <legend>
                      {row.before
                        ? row.after
                          ? "Change commitment"
                          : "Remove commitment"
                        : "Add commitment"}
                    </legend>
                    {row.before && (
                      <p className="small muted">
                        Current: {row.before.title} ·{" "}
                        {row.before.date
                          ? dateLabel(row.before.date, true)
                          : `Every ${days[row.before.weekday]}`}{" "}
                        · {row.before.start.slice(0, 5)}–
                        {row.before.end.slice(0, 5)}
                      </p>
                    )}
                    {row.after && (
                      <>
                        <label className="field">
                          Name
                          <input
                            required
                            maxLength={100}
                            value={row.after.title}
                            onChange={(e) =>
                              patchCommitment(index, { title: e.target.value })
                            }
                          />
                        </label>
                        <div className="chat-fields">
                          <label className="field">
                            Repeats
                            <select
                              value={
                                row.after.date !== null ? "once" : "weekly"
                              }
                              onChange={(e) =>
                                patchCommitment(index, {
                                  date:
                                    e.target.value === "once"
                                      ? project.settings.plan_from
                                      : null,
                                })
                              }
                            >
                              <option value="once">One date</option>
                              <option value="weekly">Every week</option>
                            </select>
                          </label>
                          {row.after.date !== null ? (
                            <label className="field">
                              Date
                              <input
                                type="date"
                                required
                                min={project.settings.semester_start}
                                max={project.settings.semester_end}
                                value={row.after.date}
                                onChange={(e) =>
                                  patchCommitment(index, {
                                    date: e.target.value,
                                  })
                                }
                              />
                            </label>
                          ) : (
                            <label className="field">
                              Day
                              <select
                                value={row.after.weekday}
                                onChange={(e) =>
                                  patchCommitment(index, {
                                    weekday: Number(e.target.value),
                                  })
                                }
                              >
                                {days.map((day, i) => (
                                  <option key={day} value={i}>
                                    {day}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                          <label className="field">
                            Start
                            <input
                              type="time"
                              required
                              value={row.after.start.slice(0, 5)}
                              onChange={(e) =>
                                patchCommitment(index, {
                                  start: e.target.value,
                                })
                              }
                            />
                          </label>
                          <label className="field">
                            End
                            <input
                              type="time"
                              required
                              value={row.after.end.slice(0, 5)}
                              onChange={(e) =>
                                patchCommitment(index, { end: e.target.value })
                              }
                            />
                          </label>
                        </div>
                      </>
                    )}
                  </fieldset>
                ))}
                {proposal.effort_changes.map((row, index) => {
                  const item = project.assessments.find(
                    (item) => item.id === row.assessment_id,
                  );
                  return (
                    <fieldset
                      className="chat-change"
                      key={row.assessment_id}
                      disabled={busy || stale || parentBusy}
                    >
                      <legend>{item?.title || "Assessment"}</legend>
                      <p className="small muted">
                        Current remaining work: {hours(row.before_minutes)} h
                      </p>
                      <label className="field">
                        Proposed remaining work (hours)
                        <input
                          required
                          type="number"
                          step={0.5}
                          min={0}
                          max={200}
                          value={row.after_minutes / 60}
                          onChange={(e) =>
                            patchEffort(
                              index,
                              Math.round(Number(e.target.value) * 60),
                            )
                          }
                        />
                      </label>
                    </fieldset>
                  );
                })}
                {!dirty && (
                  <div className="chat-impact" aria-label="Effect on your plan">
                    {(
                      [
                        ["Work remaining", "remaining_minutes"],
                        ["Study scheduled", "scheduled_minutes"],
                        ["Unscheduled work", "unscheduled_minutes"],
                        [
                          "Free time, next 7 days",
                          "next_week_available_minutes",
                        ],
                      ] as const
                    ).map(([label, key]) => (
                      <div key={key}>
                        <span>{label}</span>
                        <strong>
                          {hours(proposal.before[key])} →{" "}
                          {hours(proposal.after[key])} h
                        </strong>
                      </div>
                    ))}
                  </div>
                )}
                {!dirty && proposal.after.unscheduled_minutes > 0 && (
                  <p className="notice small">
                    {hours(proposal.after.unscheduled_minutes)} hours would
                    remain unscheduled. Confirming does not mean all the work
                    fits.
                  </p>
                )}
                {!dirty && !!proposal.warnings.length && (
                  <details className="small">
                    <summary>
                      Planning notes ({proposal.warnings.length})
                    </summary>
                    <ul>
                      {proposal.warnings.map((warning, i) => (
                        <li key={i}>{warning}</li>
                      ))}
                    </ul>
                  </details>
                )}
                {dirty && (
                  <p className="small muted">
                    You edited the proposal. Update its preview before
                    confirming.
                  </p>
                )}
                <button
                  className="button primary"
                  disabled={busy || parentBusy || stale}
                >
                  {busy
                    ? "Checking…"
                    : dirty
                      ? "Update preview"
                      : "Confirm changes & replan"}
                </button>
              </form>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {!chatConfigured && (
              <p className="notice">
                {config.chat_local
                  ? "Local chat is not ready yet. Start the local-chat launcher to load the model."
                  : "Scheduling chat needs an AI connection. App help still works here."}
              </p>
            )}
            {!!messages.length && (
              <button
                className="text-link"
                disabled={busy}
                onClick={() => {
                  setMessages([]);
                  setConversation([]);
                  setProposal(null);
                  setError("");
                }}
              >
                New request
              </button>
            )}
          </div>
          <form
            className="chat-compose"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <p
              className={`chat-quota small ${quotaReached ? "notice" : "muted"}`}
              role="status"
            >
              {usage
                ? `${usage.remaining} / ${usage.limit} messages left today · resets at midnight (${usage.timezone}).`
                : "Loading today's chat allowance…"}
            </p>
            {quotaReached && (
              <p className="small muted chat-quota">
                Daily chat limit reached. You can still edit your schedule
                directly or confirm an already reviewed proposal.
              </p>
            )}
            <label className="check-row">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              {config.chat_local
                ? "Allow the local model to read my message and schedule. This stays on this computer."
                : `Send my messages, assessment names/dates/remaining hours and commitments to ${chatProvider}.`}
            </label>
            <label className="field">
              <span className="sr-only">Message your planner</span>
              <textarea
                ref={input}
                aria-label="Message your planner"
                rows={2}
                maxLength={2000}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="e.g. Training every Tuesday and Thursday, 6pm–8pm"
              />
            </label>
            <button
              className="button primary"
              disabled={
                busy ||
                parentBusy ||
                !usage ||
                quotaReached ||
                !text.trim() ||
                (!helpOnly && (!consent || !chatConfigured))
              }
            >
              <Send size={16} />
              Send
            </button>
          </form>
        </>
      )}
    </aside>
  );
}
