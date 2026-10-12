# Ollama Cloud testing setup — 12 October 2026

Scheduling chat now supports `CHAT_AI_PROVIDER=ollama_cloud` independently of
document extraction. The backend `.env` has an empty `OLLAMA_API_KEY` placeholder
and `OLLAMA_CLOUD_MODEL=gemma4:31b`. Other credentials were preserved; `.env`
remains ignored and untracked. No real key is included in the example file.

The cloud adapter sends one HTTPS request to Ollama's fixed endpoint after
consent, validates the JSON before proposal review, and handles key/access,
credit/rate-limit, incomplete and malformed responses without retries or fallback.
Cloud consent names the remote provider; stale local consent is rejected before
inference or quota consumption. Existing confirmation and direct-edit priority
remain in place. Cloud responses use prompt schema instructions and validation,
because the service does not currently enforce structured-output schemas.

- All 229 backend tests passed; Ruff passed.
- TypeScript/Vite production build passed.
- The new Edge browser test passed: remote consent is visible, sending is blocked
  before consent, the expected provider accompanies the request, and a failed
  cloud response leaves commitments untouched.
- Earlier local-chat implementation checks: 214 backend tests, 19 frontend unit
  tests and 31 browser workflows passed; 8 chat cases passed after the provider guard.
- The two cancelled Qwen downloads were stopped and their 28 partial files removed.
  No local model inference completed. The queued local smoke test was cancelled.
- No live cloud inference was run: the user still needs to supply an API key.
  Provider requests in verification were mocked; no paid call or Notion write occurred.

The camera feature is a design proposal in `FOCUS_CAMERA_PROPOSAL.md`, not an
implemented feature. Document extraction retains its existing Azure/OpenAI setup.

# First-use and student value verification — 12 October 2026

Today now names the next assessment and its scheduled date, time and duration. The primary action instead opens hours confirmation, source checking or plan recovery when these prevent a realistic plan. A compact setup checklist links directly to unfinished steps and disappears after deadlines and actual hours are confirmed. Optional planning preferences and calendar reminders are collapsed in settings; core dates, available hours and commitments stay visible.

- Python: 197 tests passed, including confirmed-hours persistence and restoration of older backups without the new field. Ruff passed. One existing Starlette/httpx deprecation warning remains.
- Frontend: TypeScript/Vite production build and 19 unit tests passed.
- Browser: all 30 Edge workflows passed on the final build. New cases use manual entry with AI unavailable, source review, confirmation of actual hours, persistence after reload, an explicitly dated future session and a shortfall that prioritises recovery. Starting a timer does not create study activity.
- Existing chat consent/quota, direct-edit priority, progress, commitments, checklists, recovery/undo, export and backup workflows pass. Both themes retain checks at 360, 390, 768, 1024 and 1440 pixels.
- Desktop and phone screenshots inspected for setup, the usable plan and overloaded-work state. Patch whitespace check passed.
- Upload unavailability shows a useful manual-entry action instead of backend configuration instructions. Storage copy now accurately describes browser/device saving and recommends a separate backup.

Tests used an isolated QA server/chat-counter directory. Provider calls remain mocked; no paid AI call or Notion write was made. The existing port-8000 server was not stopped and needs a restart to load the new backend field. Local persistence remains device-specific; there are no user accounts or cloud sync. Usability checks do not establish willingness to pay. The proposed real-student and paid-continuation experiment is in PRODUCT_PILOT.md.

# Visual redesign verification — 12 October 2026

The frontend now uses a warm paper workspace, plum sidebar, purple progress banner, mint/peach/lavender accents, separate metric cards, an immediate next-session focus action and deadline date tiles. The visual system applies across Today, the semester overview, assessments, the study plan, exports, forms and chat. A light/dark control persists independently of semester data; a fresh installation opens in light mode.

- Production TypeScript/Vite build passed; 19 frontend unit tests passed.
- All 28 Microsoft Edge browser workflows passed. The five UI cases were rerun after the final small-text contrast refinement and passed.
- Both themes checked at 360, 390, 768, 1024 and 1440 pixels. All five navigation screens and assessment dialogs had no horizontal overflow; responsive cases reported no uncaught page errors.
- New coverage verifies the banner focus action and persistent appearance after reload and semester selection. Existing consent, direct-edit priority, chat limits/review, progress, checklists, recovery, exports and backup cases passed.
- Desktop and phone screenshots inspected for Today, semester, assessments, study plan, exports and assessment editing. Removed page-fade inheritance from dialogs; form captures wait for settled rendering.
- Patch whitespace checks passed. The running app on port 8000 serves the newly built frontend assets.

No backend changes were made and backend tests were not rerun for this visual redesign. Browser provider calls remain mocked; no paid AI call or external Notion write was used. QA uses a separate local chat-counter directory.

# UI polish verification — 12 October 2026

Today brings study sessions ahead of weekly statistics, highlights the next session and makes Start focus the primary session action. The shell adds page labels and a keyboard skip link. Assessment filters show matching counts, ignore surrounding search whitespace and offer recovery from empty results. Shared cards, headers, forms, chat and mobile navigation use more consistent spacing and action hierarchy.

- TypeScript/Vite production build passed.
- 19 frontend unit tests and all 27 Microsoft Edge browser tests passed against the final production build.
- New browser cases exercise combined-filter reset without lost assessments, keyboard skip navigation, focus controls and assessment editing at 360, 390, 768, 1024 and 1440 pixels in light and dark mode. All five navigation screens have no horizontal document overflow at those dimensions; assessment dialogs have no horizontal overflow. Responsive cases reported no uncaught page errors.
- Desktop/mobile screenshots were visually inspected in both themes. The mobile chat panel was also inspected in the in-app browser. Patch whitespace checks passed.

This update changes the frontend only; backend tests were not rerun. Provider calls in the existing browser cases remain mocked. UI testing used an isolated local chat-counter directory; no paid AI request or external Notion write was made.

# Scoped chat, daily budget and document ingestion — 12 October 2026

Chat is restricted to scheduling changes and trusted app-help topics. Common how-to questions use local answers without provider calls. A persistent SQLite budget reserves at most 25 sends per Dublin calendar day across this local installation's semesters/browsers; it survives restarts, counts failed provider attempts and supports isolated QA storage. Chat provider retries are disabled.

- 196 backend tests passed. New coverage includes concurrent quota reservation, persistence and DST reset, the 26th-send rejection before a provider request, no-provider/no-consent local help, discarded help/off-topic mutations, failed-provider accounting, fail-closed counter storage, PDF table rows, physical blank-page numbering, non-text painted-page rejection, row-preserving chunks, identity context, ZIP paths/errors/150-page references, Unicode evidence recovery and independent date/time validation.
- 19 frontend unit tests passed.
- All 23 Microsoft Edge browser cases passed against the final build/backend with two workers. New cases cover app help without an AI account or consent, last-message/zero-allowance behavior, reload persistence and confirming an existing reviewed proposal after exhausting the allowance. Delayed availability undo now verifies that settings entry waits for the save.
- TypeScript/Vite build, Python lint and patch whitespace checks passed. Updated chat/check-in layouts were checked at 360, 390, 768, 1024 and 1440 pixels with no horizontal overflow or uncaught browser errors; the mobile quota/confirmation layout was visually inspected.

AI calls remain mocked in verification. Real PDF parsing was tested with generated text/table/blank/vector examples; no measured accuracy improvement on a real student handbook corpus is claimed. Scanned/image-only or otherwise non-text painted PDFs still require OCR. No additional extraction pass or model change was introduced. Direct edits, check-ins and local preview confirmation do not consume chat messages; document extraction is separate. This is an installation quota for the current local app, not a hosted per-student/account spending cap.

# Reviewed planner chat and remaining-work verification — 12 October 2026

This update adds bounded AI interpretation with explicit consent, editable commitment/effort proposals, deterministic impact previews, confirmed apply and stale-proposal protection. Completed sessions now offer On track / Need more time / Finished. Personal estimates use optional, editable medians of recorded completed work.

- 169 Python regression tests passed, including atomic clarifications, compound changes, work/capacity conservation, direct-edit priority, review-before-confirmation, expiry, invalid IDs/intervals/effort, limited provider context, mocked SDK refusal/incomplete output, consent/locking, check-in bounds/status/undo and legacy activity compatibility.
- 19 frontend unit tests passed, including the minimum historical sample, median/outlier handling, demo/type/unfinished exclusion, semester deduplication, module preference and actual logged-work totals.
- The full 21-case Microsoft Edge browser suite passed against the production build. New cases cover multi-turn clarification and editable preview/apply/persistence, a direct edit during a delayed chat response, check-ins and feedback undo, optional editable personal suggestions, and direct estimate edits while a check-in is open.
- TypeScript/Vite build and Python lint passed. Chat and check-in layouts were checked at 360, 390, 768, 1024 and 1440 pixels without horizontal body/panel overflow or uncaught browser errors; mobile chat/check-in previews were visually inspected.

AI interpretation is mocked in verification; no paid provider call, live Azure model-quality evaluation or Notion write was performed. Local review/apply and deterministic replanning were exercised against the real API. Suggestions reflect logged time, which can omit study done elsewhere. Data stays in the current browser/device; chat transcripts are temporary page state, and accounts/cross-device sync remain unimplemented. A reviewed-content digest prevents accidentally confirming edited values with an old preview; it is not authentication.

The release reports below describe earlier states of the app.

# Protected commitments and recovery verification — 12 October 2026

This update adds recurring and one-off work/training/lecture commitments, dated extra study time, measured recovery alternatives, reviewed apply and progress-preserving undo. Empty-semester onboarding starts with realistic free time. A semester-loading navigation race was also fixed.

- 140 Python regression tests passed. New coverage includes partial overlaps, one-off recurrence, overlapping-window union, days off, work conservation, protected time during recovery, unchanged deadlines/estimates/history, buffer changes, bounded near-term suggestions, unknown dates, legacy backups, invalid inputs and reviewed/stale API settings.
- 14 frontend unit tests passed.
- The full 16-case browser suite passed in Microsoft Edge against the final production build and refreshed backend. New cases cover weekly training persistence, one-off shifts and clearing a date without changing recurrence, exact recovery previews, apply/undo after progress, rejected changes and delayed semester loading with a later tab choice.
- TypeScript/Vite production build, Python lint and patch whitespace checks passed.
- Today, commitments and recovery were checked at 360, 390, 768, 1024 and 1440 pixels: no horizontal body/dialog overflow or uncaught browser errors. Mobile commitment entry and recovery plus desktop recovery were visually inspected.
- A single local performance sample with 300 assessments, 50 commitments and a 365-day semester generated recovery options in 1.369 seconds. This is one machine/sample, not a service guarantee.

No live AI extraction or Notion writes were used for this update. Existing provider tests remain mocked. Student data remains device-local; chat entry and cross-device accounts/sync are not implemented. Calendar exports contain the adjusted study plan, not duplicate busy-event entries. Recovery undo is a page-session shortcut and is invalidated by another settings edit; dated extra windows remain editable in settings.

# Daily-use features verification — 12 October 2026

This update adds a persistent focus timer, assessment checklists, weekday-specific study windows, weekly goals and actual activity timestamps.

- 121 Python tests passed, including custom capacity/time windows, days off, effort conservation, checklist validation and legacy activity migration.
- 14 frontend unit tests passed, including timer restore/pause/background elapsed time, invalid timer data and actual completion dates across timezone boundaries.
- 11 browser cases passed: the existing seven-case workflow suite plus timer pause/reload/semester switching/explicit logging, checklist persistence, custom availability/goals and failed-save rollback. The full ten-case suite passed before the final recovery test was added; the four new-feature cases passed together after that addition.
- Production TypeScript/Vite build and Python lint passed. Patch whitespace check passed.
- All five views were checked at 360, 390, 768, 1024 and 1440 pixels with the timer active; no horizontal overflow or uncaught browser errors. The custom availability dialog was also inspected at 390 pixels.

The timer and checklists are local to the browser/device. Timer expiry and checklist ticks do not log study automatically. AI/Notion calls remain mocked; this update makes no new external provider requests.

# Standalone planner verification — 12 October 2026

The standalone update adds Today, progress logging, missed-session replanning, submission status, saved semesters, capacity-based workload warnings and calendar reminders.

- Python regression suite: 112 tests passed, including effort conservation, no reuse of logged time, reversible sessions, stale-action rejection, capacity pressure, backward-compatible backups and ICS reminder round trips.
- React tests: 8 passed, covering date handling, persistent semesters, migration and recovery of unreadable storage.
- Production TypeScript/Vite build passed.
- Browser suite: 7 passed in Microsoft Edge against the production build, covering consent, manual review, daily progress, move/undo, submitted/reopened assessments, calendar download, backup restore and reopening in a fresh browser session.
- All five views checked at 360, 390, 768, 1024 and 1440 pixels: no horizontal overflow or uncaught browser errors. Light/dark previews inspected.
- Python lint and Windows launcher syntax checked. Linux launcher changes were reviewed but not executed on Windows.

AI and Notion external requests remain mocked in automated tests; no paid extraction or live Notion write was used to verify this update. Saving is local to this browser/device; accounts and cloud sync are not implemented.

The following reports are retained as historical release records.

# Release verification

## Azure Foundry update — 9 October 2026

The Azure provider update, integrated with the concurrent document-format additions, passed **102 backend tests, 4 frontend unit tests and 5 browser tests** (111 total). The production frontend build, Ruff checks and `git diff --check` passed. Browser tests ran against the Azure-enabled backend in the clean runtime environment; the final document parser was checked in the backend suite.

New checks cover Azure resource/v1 endpoint normalization, rejecting project/operation URLs, explicit provider selection without fallback, deployment names on actual SDK HTTP requests, sanitized configuration/provider errors, key exclusion from API configuration, and provider-specific upload consent. AI HTTP calls in these checks were mocked; **a real Foundry request and live Notion sync still require local credentials and have not been verified**.

The production npm dependency audit reports zero vulnerabilities. `npm ci` reported three development-dependency advisories (one moderate, two critical); those development dependencies are excluded from the runtime Docker image. The earlier coverage number below belongs to the initial release and was not recomputed for this update.

## Initial release checks

Verified on **9 October 2026** using Windows, Python **3.11.9**, Node **24.19.0**, and a headless Chromium browser. These are executed results, not proposed tests.

| Check | Result |
|---|---|
| Backend pytest suite | **71 passed** |
| Backend statement coverage | **86%** (856 statements; 119 not covered in the parent process) |
| Frontend Vitest suite | **4 passed** |
| Playwright browser workflows | **3 passed**, including a rerun against the clean runtime environment |
| TypeScript compilation and Vite production build | Passed |
| Ruff lint and formatting | Passed |
| Prettier frontend source check | Passed |
| Clean Python environment, installed only from `requirements.lock` | Installation and `pip check` passed |
| Clean-runtime API import, demo planner, ICS export and subprocess PDF ingestion | Passed |
| Frontend production dependency audit | `npm audit --omit=dev --audit-level=moderate`: 0 reported vulnerabilities at check time |
| Visual review | Desktop/mobile dashboard and all three generated one-page demo PDFs inspected |

**Total: 78 automated tests passed.** The PDF parser intentionally runs in a subprocess, so the parent-process coverage report undercounts code exercised inside that worker. Coverage is not a guarantee of correctness.

## Behaviors exercised

- Effort conservation, no overlapping allocations, daily capacity, days off, buffers, earliest-deadline priority, past-time exclusion and shortfalls.
- Fifty deterministic randomized workload scenarios inside the scheduling invariant test.
- Unknown/out-of-semester/overdue dates, unreviewed assessments, module-weight separation, duplicate IDs and invalid settings.
- Dublin daylight-saving gap/fold rejection and correct UTC conversion in calendar export.
- Valid text PDFs; malformed, scanned, encrypted, excessive-page and oversized inputs; text encoding and null-byte rejection.
- Source-quote matching, invalid extracted dates/weights, conflict-preserving re-uploads and refusal/incomplete-result handling.
- The actual OpenAI Python SDK request/response parser using an HTTP mock, including strict JSON schema and `store=False`.
- Notion database/schema payloads, calendar-view property IDs, stable repeat syncs, preservation of `Done`, superseding obsolete rows, foreign-row protection, duplicate-key rejection, pagination, rate-limit handling and partial-failure recovery, all with mocked HTTP.
- File-upload consent, local-origin protections, request-size limits, sanitized validation errors and concurrent-extraction rejection.
- CSV formula protection, ICS parsing and JSON project roundtrips.
- Browser demo loading, review-flag reset on editing, effort-capacity changes, calendar download, backup/restore, refresh persistence, manual undated entries and mobile overflow checks.

## Boundaries and known warnings

- **No live OpenAI extraction or Notion workspace sync was run.** Credentials were not supplied. HTTP/SDK contract tests pass, but account access, model availability, extraction quality on real handbooks, and live Notion permissions still need testing with the operator's accounts.
- Docker configuration was reviewed but **not built/run** because the Docker engine was unavailable. The CLI could not connect to the Docker Desktop Linux engine pipe.
- The GitHub Actions workflow is provided but was not executed on GitHub. macOS/Linux launchers and Linux-specific PDF memory limits were not executed in this Windows run.
- Starlette emitted a deprecation warning about its current `httpx` test-client backend. All tests passed; this concerns the test harness, not live provider calls. Revisit that backend when upgrading the test dependencies.
- Chromium emitted a terminal color-environment warning; it did not affect tests.
- The npm audit result covers production JavaScript dependencies at the check time, not Python dependencies or a full security audit.

Before your live pitch, configure the two integrations and run one permitted real handbook through review and sync. Use a small, verified project for the time-constrained demonstration.
