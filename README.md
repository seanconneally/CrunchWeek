# Crunch Week

**Know what to study today, and plan around the rest of your life.**

Crunch Week is a student planner built with React, TypeScript and FastAPI. Import module documents or enter assessments manually, check the deadlines, and get a study plan that fits around classes, work and training. Log actual study and adjust the remaining work as you go.

The app runs on your computer. The demo and manual planning need no API keys. AI chat and document extraction are optional, separately configured features. Notion is an optional export.

## Contents

- [Run the app](#run-the-app)
- [Make your first plan](#make-your-first-plan)
- [Current features](#current-features)
- [Set up AI](#set-up-ai)
- [Using planner chat](#using-planner-chat)
- [Importing module documents](#importing-module-documents)
- [Study sessions and remaining work](#study-sessions-and-remaining-work)
- [Availability and workload warnings](#availability-and-workload-warnings)
- [Exports and optional Notion](#exports-and-optional-notion)
- [Saving, privacy and current limitations](#saving-privacy-and-current-limitations)
- [Development and checks](#development-and-checks)
- [Troubleshooting](#troubleshooting)
- [Project structure and further reading](#project-structure-and-further-reading)

## Run the app

Use **Python 3.11 or 3.12** and **Node 22.12+ or 24 LTS**. Open a terminal in the repository root: the folder containing `start.ps1`, `frontend/` and `crunch_week/`.

For a fresh checkout:

```sh
git clone https://github.com/seanconneally/CrunchWeek.git
cd CrunchWeek
```

If you already have the project, use that checkout rather than creating another nested copy.

**Windows PowerShell or Command Prompt:**

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

**macOS / Linux:**

```sh
sh start.sh
```

Open **http://127.0.0.1:8000**. Choose **Explore the demo** to try the app without configuring a provider, or start with a manually entered assessment.

The launchers create `.venv` if needed, install Python dependencies from `requirements.lock`, install frontend dependencies if missing, and **rebuild the frontend on every launch**. The first run needs internet access and may take several minutes. Keep the terminal open; press **Ctrl+C** to stop the app. The PowerShell execution-policy flag applies only to this launch.

For cloud chat, use this normal launcher. The separate `start-local.ps1` launcher downloads and runs a local model; it is an optional alternative described below.

## Make your first plan

1. Open **Semester & availability**. Set semester dates and confirm your actual free hours. The app labels default hours until you save your settings.
2. Choose **Add assessment** or **Upload handbooks**. Check the deadline, time and weighting against the source, set realistic remaining work, and mark the assessment reviewed.
3. Protect training, work and classes through **Add training with chat** or **Add work or training** on Today. Use exact days and start/end times.
4. Open **Today** for the next study session and its date, time and duration. If the plan cannot fit, review **Make room** options or revise your availability.
5. Start a focus timer or mark a completed session **Done**. Update remaining work after the session, and mark the assessment submitted separately when you hand it in.
6. Download a **project backup** under Exports or from the sidebar. Semesters are saved in this browser on this device.

The setup checklist links to unfinished steps. The primary action on Today opens the next session, hours confirmation, source review or plan recovery as appropriate.

## Current features

| Area | What you can do |
| --- | --- |
| Workspace | Use a responsive desktop/phone layout, light/dark appearance, a progress banner and clear next-session actions. |
| Assessments | Import supported documents, add/edit/delete manually, search/filter/sort, verify quoted evidence, and track submission separately from study. |
| Planning | Spread study across available days, or plan backwards from deadlines; account for buffers, days off and protected commitments. |
| Work and training | Add weekly or one-off commitments manually or through reviewed chat. Study avoids overlapping time. |
| Planner chat | Describe schedule and remaining-work changes, edit the proposal, compare its effect and confirm before applying. Ask how to use the app. |
| Daily study | Use Today, the full Study plan, a persistent focus timer, Done/Move controls, and reversible recent activity. |
| Remaining work | Choose On track / Need more time / Finished after a session; review editable personal estimates when enough completed examples exist. |
| Assignment steps | Add checklists or starter steps. Ticks save independently of hours and submission status. |
| Progress | Set a weekly study goal and see completed study by actual log date. |
| Recovery | Compare extra study windows and buffer changes when work does not fit; review exact sessions and the remaining shortfall before applying. |
| Semester overview | See deadlines, module weights, an interactive calendar and weekly workload pressure. |
| Saving and exports | Keep multiple semesters, restore JSON backups, export CSV and ICS calendars with optional reminders, or sync to Notion. |

Recent updates include the redesigned workspace, first-use guidance, prominent training-chat entry points, Ollama Cloud and optional local chat, reviewed schedule changes, session check-ins, personal estimate suggestions, and broader document ingestion with stronger evidence checks.

## Set up AI

Create `.env` **in the repository root**, beside `start.ps1`. If it does not exist, copy `.env.example` once; preserve any existing `.env` and its credentials.

```powershell
# Windows: only create the file if it is missing.
if (-not (Test-Path -LiteralPath .env)) { Copy-Item -LiteralPath .env.example -Destination .env }
```

```sh
# macOS / Linux: only create the file if it is missing.
if [ ! -f .env ]; then cp .env.example .env; fi
```

Edit the settings for the features you want, then **restart the backend and refresh the browser**. Existing process environment variables take precedence over `.env`.

### Ollama Cloud for scheduling chat

This is the simplest chat setup when you want to avoid downloading a model. No Ollama app installation is required.

1. Create a key at [Ollama API keys](https://ollama.com/settings/keys).
2. Set these values in `.env`:

   ```dotenv
   CHAT_AI_PROVIDER=ollama_cloud
   OLLAMA_API_KEY=your_api_key_here
   OLLAMA_CLOUD_MODEL=gemma4:31b
   ```

3. Restart with `start.ps1` or `start.sh` and open **Add training with chat**. Review the **Ollama Cloud** data-sharing notice before sending.

The committed example has an empty key field; supply your own key locally. Use the cloud **API model name**, such as `gemma4:31b`, rather than a CLI `:cloud` alias. If your account cannot access the default model, choose an available API model from [Ollama's cloud model list](https://ollama.com/api/tags) and change `OLLAMA_CLOUD_MODEL`.

[Free Ollama accounts](https://ollama.com/pricing) have limited starter credits and model access. The app's 25-message limit does not guarantee unlimited free provider usage. Key/access failures and exhausted provider credits are reported without silently switching providers or applying changes.

Ollama Cloud [does not currently enforce structured outputs](https://docs.ollama.com/capabilities/structured-outputs). Crunch Week supplies a schema in the prompt and validates the returned JSON before creating a reviewable proposal. Malformed or incomplete results are rejected. The cloud adapter is covered by mocked tests; live cloud inference still needs verification with a valid key. See [the test report](docs/TEST_REPORT.md).

**An Ollama chat key does not enable document extraction.** Configure Azure or OpenAI separately below, or enter assessments manually.

### Azure or OpenAI for document extraction

Extraction uses the Responses API with structured outputs. Choose one provider explicitly.

**Azure AI Foundry / Azure OpenAI:**

```dotenv
AI_PROVIDER=azure
AZURE_OPENAI_ENDPOINT=https://YOUR-RESOURCE.services.ai.azure.com/openai/v1/
AZURE_OPENAI_API_KEY=your_resource_key
AZURE_OPENAI_DEPLOYMENT=your_exact_deployment_name
```

Use a deployment supporting Responses structured outputs. The deployment name can differ from the model name. HTTPS resource endpoints ending in `.services.ai.azure.com` or `.openai.azure.com` are accepted, at the resource root or `/openai/v1/`. Remove a trailing `responses`; do not use a project URL containing `/api/projects/`. This adapter uses API-key authentication; no separate OpenAI key, tenant ID or API-version setting is required.

**OpenAI:**

```dotenv
AI_PROVIDER=openai
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4.1-mini
```

The upload flow asks permission to send extracted document **text** to the selected provider. It does not send the original file to that provider. The Responses request sets `store=False`; this does not override provider retention policies. Calls may incur charges. Test the connection with a short synthetic document before using real module material.

### Chat provider selection

| `CHAT_AI_PROVIDER` | Chat connection | Required settings |
| --- | --- | --- |
| `ollama_cloud` | Ollama Cloud HTTPS API | `OLLAMA_API_KEY`; optional `OLLAMA_CLOUD_MODEL` |
| `ollama` | Ollama running on this computer | Downloaded `OLLAMA_MODEL`; optional loopback `OLLAMA_BASE_URL` |
| `azure` | Azure | The three `AZURE_OPENAI_*` values above |
| `openai` | OpenAI | `OPENAI_API_KEY`; optional `OPENAI_MODEL` |
| Unset or empty | Same provider as extraction | Settings selected by `AI_PROVIDER` |

Chat and extraction do not automatically fall back to another provider. `/api/config` reports readiness without returning keys. For cloud providers, “configured” means settings are present and structurally valid; it does not establish valid credentials, available credit or successful inference.

### Optional local Ollama chat

Keep this alternative for testing on your own hardware. Install [Ollama for Windows](https://ollama.com/download/windows), stop the current app server, then run:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-local.ps1
```

The launcher starts Ollama if needed and downloads `qwen2.5:1.5b` if absent, then starts Crunch Week on port 8000. The model download is about 986 MB and can take time; running this launcher starts or resumes it. A small model is a testing baseline, not an accuracy guarantee. No completed local-model inference was verified in the latest checks.

The launcher overrides chat settings for its process, without editing `.env`:

```dotenv
CHAT_AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:1.5b
```

Local mode accepts only HTTP loopback endpoints and local model tags. Scheduling context stays on this computer; requests use no environment proxy or redirects. There is no cloud fallback. The model is requested to unload after two idle minutes. Document extraction still uses its separately configured provider and consent flow. For cloud chat, return to a fresh terminal and use the normal launcher.

Never put keys in React code, `VITE_` variables, browser storage, backups or `.env.example`. `.env` is ignored by Git. Adding an ignore rule does not remove secrets from earlier commits; rotate exposed keys and remove them from history before publishing.

## Using planner chat

Choose **Add training with chat** on the welcome screen or Today, or **Planner chat** in the page header.

Examples:

> I have training every Tuesday and Thursday from 18:00 to 20:00.
>
> I work this Friday from 17:00 to 21:00, and Research report needs another two hours.
>
> Where do I set my free hours?

Chat is limited to schedule changes and help using Crunch Week. It can add, edit or remove commitments and adjust remaining study effort. It cannot change assessment deadlines, write coursework, submit work or act as a general chatbot. Ambiguous times or assessment names need clarification.

After consent, send the request and review the proposed dates, times and remaining hours. The preview compares remaining work, scheduled hours, unscheduled hours and free time in the next seven days. Edit proposed values and choose **Update preview** to recalculate their effect. **Confirm changes & replan** applies the reviewed changes. Sending a message alone never saves them.

Direct app edits take priority. Planning edits, activity or semester changes invalidate stale proposals; previews also expire after 15 minutes. A changed provider is rejected before inference when the request still expects the previous provider. Reopen the app and review the current consent notice.

Common how-to questions and help shortcuts use built-in answers without an AI account or consent. Other natural-language questions may use the configured provider to select a trusted help topic. Help responses cannot alter the project.

### Daily allowance and shared context

The app permits **25 chat messages per day across the local installation**, shared between its browsers and semesters. It resets at midnight in **Europe/Dublin**, regardless of semester timezone. The remaining allowance appears in chat.

The counter persists in `.local/chat_usage.sqlite3`; reloads, semester changes, backup restores and server restarts do not reset it. Common local help messages count, and provider attempts count even if they fail. Direct edits, check-ins and reviewing/confirming an existing proposal do not count. There are no automatic interpretation retries. Document extraction has a separate usage cost and no shared 25-message allowance.

Only messages and minimal planning context are sent: semester dates/timezone, assessment IDs/names/modules/types/dates/remaining effort, and commitments. Documents, evidence, notes, checklists, study history, credentials and other semesters are omitted. Chat transcripts and proposals are temporary page state. Preview, review and apply use local validation rather than another AI call. This is an installation budget, not a per-student account quota.

## Importing module documents

Choose **Upload handbooks**, select files, consent to extraction, and review the returned assessments against the original documents. The feature parses uploaded files; it does not sign in to Moodle, Brightspace or another LMS. You can upload a downloaded ZIP of module materials.

| Format | Supported extensions |
| --- | --- |
| PDF | `.pdf` with readable text |
| Word | `.docx`, `.docm`, `.dotx` |
| PowerPoint | `.pptx`, `.pptm` |
| Excel | `.xlsx`, `.xlsm` |
| OpenDocument | `.odt`, `.odp`, `.ods` |
| Web / rich text | `.html`, `.htm`, `.rtf` |
| Text / tables | `.txt`, `.md`, `.csv`, `.tsv` |
| Archive | `.zip` containing supported documents; nested ZIPs are skipped |

Macro-enabled Office files are parsed for text; their macros are not executed. Images/screenshots, legacy `.doc`/`.ppt`/`.xls`, and Apple Pages/Keynote files are unsupported. Export those to a supported text-based document first. Scanned PDFs need OCR before upload; encrypted PDFs need an unlocked copy. OCR is not built in.

### Limits and evidence checks

- Up to **5 files** per upload flow, processed sequentially; **25 MB** and **120,000 extracted characters per file**, including the combined contents of a ZIP.
- PDFs allow **50 physical pages**; presentations allow 50 slides. Excel parsing inspects the first 50 sheets. ZIPs allow 150 combined content pages. Office/ZIP archives have a 60 MB declared uncompressed-size limit.
- Projects allow 300 assessments. Split larger collections into manageable uploads and compare the complete assessment list with the sources.
- PDF parsing uses a separate process with a 25-second timeout. Genuine blank pages are allowed while source page numbers remain intact. Non-text pages with unreadable content are rejected so scanned assessment pages are not silently skipped.
- PDF layout rows are retained when all readable tokens survive. Long extraction inputs are split with overlap and file-header context; ZIP labels preserve folder paths to distinguish similarly named documents.
- Evidence matching accounts for whitespace, ligatures and wrapped hyphens. A source page is corrected only when the quote matches one page uniquely. Unmatched or ambiguous evidence clears unsupported dates/times/weights; it does not invent replacements.
- Missing years and bare “Week 10” dates stay unknown. A week plus weekday may be converted using semester context, with a review note. Semester weeks are consecutive seven-day intervals, which may differ from university teaching weeks.
- Date-only deadlines remain date-only. Weight percentages are per module. The editable four-hour initial effort estimate is a starting point, not a value established by the document or AI.

Unknown or unreviewed deadlines stay visible outside the study plan. Editing assessment details clears their reviewed flag. Earlier successful files remain saved if a later upload fails; identical re-uploads preserve existing entries. ZIPs report unreadable supported files as warnings. Extraction and evidence checks do not prove completeness or accuracy: verify both the details and the final list.

## Study sessions and remaining work

**Start focus** opens a timer that survives navigation and reloads on this device. Pause/resume as needed. When the timer ends, **Log N min** records the planned session; it never logs automatically. A timer belongs to its original semester. If the assessment or plan changed, stale logging is rejected.

**Done** logs completed study, reduces remaining effort and rebuilds the plan. **Move this session** releases the appointment and replans without reusing that skipped time. **Recent activity → Undo** reverses a logged or moved session. Time passing does not imply that you studied.

After logging, choose:

- **On track:** keep the remaining estimate after the completed session.
- **Need more time:** enter revised remaining hours or add 30/60/120 minutes, then confirm.
- **Finished:** set remaining study work to zero after confirmation. The deadline, review and submission status stay intact.

You can skip a check-in and reopen the latest unchecked completed session through **Check progress**. A direct estimate edit invalidates an open check-in until you choose **Use latest estimate**. Undo reverses check-in feedback only when it remains current; later estimates are preserved with the undone session's minutes restored.

The assessment editor offers an editable personal estimate after at least three completed examples of the same type exist in saved semesters. It uses the median logged duration of the latest 20 matching examples, preferring the same module when it has at least three. Demo data, unfinished work and the current assessment are excluded. Logged work already completed is subtracted from the suggested remaining amount. The suggestion fills the form; saving applies it. Unlogged study cannot inform it.

Checklists and starter steps track tasks separately from study hours. Ticks are immediately saved and reversible. A weekly study goal is a personal target, not additional availability; progress charts use actual completion timestamps in the semester timezone. Mark an assessment submitted separately when you hand it in, and reopen it if needed.

## Availability and workload warnings

Set regular weekdays, start time and capacity, or use **Your week, your hours** for a different window per chosen weekday. Custom weekday windows replace the general daily hours. Add days off and one-off study windows as needed; overlapping windows do not double-count capacity.

Weekly and one-off commitments protect training, work, lectures and appointments. Any overlapping half-hour study slot is blocked. Enter exact times, split overnight events across dates, and use the semester timezone. Upcoming commitments appear on Today.

The default planner starts early and spreads work across less-loaded available days. The alternative deadline strategy works backwards. Study is scheduled **before deadline day**, with optional extra buffer days. Only reviewed, active assessments with valid deadlines are planned. Shortfalls are reported explicitly when remaining effort cannot fit. **Rebuild from now** discards elapsed appointments and schedules remaining work into future slots.

Weekly pressure compares **remaining work due that week / still-available study hours that week**: clear means no work due, steady is below 75%, busy is 75–100%, and crunch is over 100% or work due with no hours. It shows where earlier study may help; actual plan infeasibility is reported separately as unscheduled work. Module percentages are not summed into a semester weighting.

### Make room

When study cannot fit, **Make room** compares removing extra buffer days, adding up to 30 minutes near existing study hours on available days in the next 14 days, or both. Only options that reduce the shortfall are offered. Review exact dates, affected assessments and remaining unscheduled hours before **Use this option**. Deadlines and effort estimates are not changed automatically. Days off and commitments still take precedence.

**Undo availability change** restores previous settings while retaining study progress and current assessment edits. The shortcut lasts for the current page session and is invalidated by another settings edit. Extra sessions remain editable under **One-off study time**.

## Exports and optional Notion

Exports includes **CSV**, an **ICS calendar** and a **JSON project backup**. Calendar downloads are snapshots: export again after changes and replace the previous imported calendar to avoid duplicates. Optional deadline/study reminders are delivered by the calendar app, not by Crunch Week itself. JSON backups preserve the project's identity, assessments, settings and study history; older version-1 backups migrate automatically.

### Connect Notion

1. Create a Notion internal integration/connection with read, insert and update content capabilities.
2. Share a normal parent page with it.
3. Set `NOTION_TOKEN` in `.env`; optionally set `NOTION_PARENT_PAGE_ID` to the parent page URL or UUID. Restart the backend.
4. Open **Exports → Optional: connect Notion**, enter the parent page if needed, and choose **Create semester database**.
5. Review assessments, then **Sync to Notion**. Download a JSON backup after connecting.

The adapter uses Notion API version `2026-03-11` and data sources. It creates Semester calendar, Deadlines and Study plan views with semester-week/pressure fields. Repeat syncs update stable project/item keys. Removed local entries become superseded rather than being deleted; app-created views filter them out.

Sync is one way. App-managed fields overwrite their Notion counterparts; Notion edits are not read back into the planner. The Notion Done checkbox and unrelated properties are preserved. Keep original property names/types, do not duplicate Crunch keys, and restore the original project backup before reconnecting from another browser. A new project owns different rows.

Interrupted syncs report partial results. Retry using the same project; completed writes remain, and existing keys reconcile subsequent syncs. Avoid simultaneous syncs from multiple backend processes. Notion is optional for all core planning features.

## Saving, privacy and current limitations

Semesters, source excerpts, settings and progress live in this browser's `localStorage`. Closing the browser keeps them; another device/browser or cleared site data requires a downloaded backup. If storage fails, the app retains current changes in memory and asks for a backup. Unreadable saved library data is retained under a recovery key before opening a fresh library.

The backend has no persistent project or document database. Upload bytes/text are released after processing; multipart handling may use temporary OS files. The daily chat counter stores dates/counts, not messages. Keys stay on the backend and are excluded from frontend bundles and project exports. Cloud chat and document extraction send their respective limited inputs only after consent; review each provider's policies before uploading private material.

This release is a **local, single-operator application**. It does not include accounts, cross-device cloud saving, LMS authentication/import, two-way calendar sync, app-delivered notifications or subscriptions. A hosted service needs authenticated access, isolated student data, HTTPS, durable saving, recovery/deletion and per-account quotas. Keep the default loopback binding for local use.

**Camera monitoring is not implemented.** The focus timer does not use the camera. The optional local-processing design and its accuracy/privacy limits are documented in [the focus-camera proposal](docs/FOCUS_CAMERA_PROPOSAL.md).

PDF worker limits are containment rather than a hostile-file sandbox: Linux additionally uses a 768 MB address-space cap; Windows has the time limit without that memory cap. Restrict access when handling untrusted uploads. No improved grades, perfect extraction or proven willingness to pay is claimed. See [the student pilot plan](docs/PRODUCT_PILOT.md) for testing repeat use and actual payment demand.

## Development and checks

Create and activate a virtual environment from the repository root:

```sh
python -m venv .venv
```

```powershell
# Windows PowerShell
.\.venv\Scripts\Activate.ps1
```

```sh
# macOS / Linux
. .venv/bin/activate
```

Install development dependencies and start the backend:

```sh
python -m pip install -r requirements-dev.txt
python -m uvicorn crunch_week.api:app --reload --host 127.0.0.1 --port 8000
```

In a second terminal:

```sh
cd frontend
npm ci
npm run dev
```

Open **http://127.0.0.1:5173**. Vite proxies `/api` to port 8000. Interactive API documentation is at **http://127.0.0.1:8000/api/docs**; health is at `/api/health`.

For production, run `npm run build` in `frontend`, then start/restart FastAPI. It serves `frontend/dist` when that directory exists at startup. The normal launchers build automatically; manually started servers need a frontend rebuild after frontend changes.

### Checks

From an activated backend environment:

```sh
python -m ruff check crunch_week tests scripts
python -m pytest --cov=crunch_week --cov-report=term-missing
```

From `frontend`:

```sh
npm test
npm run build
npx playwright install chromium
# Keep the production backend running on port 8000 in another terminal.
npm run test:e2e
```

Use `PLAYWRIGHT_BASE_URL` for another backend port and `PLAYWRIGHT_CHANNEL=msedge` to use installed Microsoft Edge. `CRUNCH_WEEK_DATA_DIR` selects a separate writable backend directory for chat counters during testing. Automated external-provider tests use mocked responses; they do not establish live AI or Notion access. The latest completed checks and their limits are in [TEST_REPORT.md](docs/TEST_REPORT.md).

### Docker

```sh
docker compose up --build
```

The included configuration builds the frontend, runs the backend as UID 10001, binds port 8000 to host loopback and sets CPU/memory limits. Docker must be installed separately.

The current Compose file forwards extraction and Notion settings, **but does not forward the new chat-specific variables or persist the chat counter**. For cloud chat in a container, add the `CHAT_AI_PROVIDER`, `OLLAMA_API_KEY` and `OLLAMA_CLOUD_MODEL` environment values and mount a persistent data directory writable by UID 10001; set `CRUNCH_WEEK_DATA_DIR` to its container path. Local Ollama's loopback-only adapter cannot reach a host model server from a separate container. Use the normal launcher for the documented cloud/local chat setup. Docker was not revalidated in the latest chat checks.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| App will not open | Keep the terminal running, check Python/Node are on PATH, and open `http://127.0.0.1:8000/api/health`. Another server may already occupy port 8000. |
| Changes do not appear | Restart through the normal launcher, or rebuild the frontend when starting FastAPI manually. Refresh the browser. |
| Chat says the key is missing | Set `CHAT_AI_PROVIDER=ollama_cloud` and a real `OLLAMA_API_KEY` in the root `.env`, then restart. |
| Cloud key/model rejected | Check key validity and your account's model access. Use an API model name without `:cloud`. |
| Cloud credits/rate limit reached | Check Ollama usage/credits. Direct planning and reviewed proposal confirmation remain available. |
| A model download starts | You used `start-local.ps1`. For cloud testing, stop it and use `start.ps1` in a fresh terminal. |
| Old provider still selected | Process environment overrides `.env`. Use a terminal without old `CHAT_AI_PROVIDER`/provider overrides, then restart. |
| Document extraction unavailable despite chat working | Configure Azure/OpenAI separately under `AI_PROVIDER`. The Ollama key only enables chat. |
| Proposal or check-in is stale | Direct edits take priority. Generate a fresh proposal or choose Use latest estimate before submitting feedback. |
| Scanned/unsupported document | OCR scans or export an unlocked text-based PDF/modern Office file. Images and legacy Office files are unsupported. |
| Nothing fits before a deadline | Check reviewed dates and real free hours. Review Make room, one-off windows and remaining-work estimates. |
| Project missing on another device | Restore its JSON backup. There is no account or cloud project sync. |
| Calendar duplicates | Replace the previously imported calendar; ICS is a snapshot, not a subscription. |
| Notion fails or sync is interrupted | Check page sharing and integration permissions; retry with the same project and preserve the original backup/schema. |

See [additional troubleshooting](docs/TROUBLESHOOTING.md) for Azure, extraction and Notion errors. Bug reports should include sanitized errors, versions and a synthetic reproduction; exclude API keys, `.env` and private documents.

## Project structure and further reading

```text
crunch_week/
  api.py          API routes, validation, uploads and frontend hosting
  models.py       Assessments, availability, commitments and project schemas
  ai_config.py    Separate extraction/chat provider configuration
  assistant.py    Scheduling interpretation and reviewed proposals
  app_help.py     Trusted app-help answers
  cloud_ai.py     Validated Ollama Cloud chat transport
  local_ai.py     Local Ollama structured generation
  chat_usage.py   Persistent 25-message daily allowance
  documents.py    Bounded document parsing and source context
  extraction.py   Azure/OpenAI extraction, evidence checks and merge handling
  planner.py      Capacity-constrained scheduling and weekly pressure
  progress.py     Reversible study actions
  estimates.py    Post-session remaining-work check-ins
  recovery.py     Reviewed availability recovery options
  exports.py      CSV and ICS generation
  notion.py       Optional database/views and repeat-safe sync
  demo.py         Synthetic demo data
frontend/src/
  App.tsx         Workspace and saved-semester orchestration
  components/     Today, chat, focus, assessments, availability and exports
  storage.ts      Browser library persistence and migration
  estimates.ts    Personal estimate suggestions from completed work
  api.ts          Typed API calls and downloads
  types.ts        Frontend contracts
tests/            Backend and provider-contract tests
frontend/e2e/     Browser workflow tests
sample_data/      Synthetic demo module documents
docs/             Product plans, architecture, verification and troubleshooting
start.ps1         Normal Windows launcher
start.sh          Normal macOS/Linux launcher
start-local.ps1   Optional Windows local-model launcher
```

- [Architecture](docs/ARCHITECTURE.md)
- [Verification report](docs/TEST_REPORT.md)
- [Product direction](docs/PRODUCT_DIRECTION.md) and [student pilot](docs/PRODUCT_PILOT.md)
- [Camera proposal](docs/FOCUS_CAMERA_PROPOSAL.md)
- [Demo and pitch guide](docs/DEMO_AND_PITCH.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Ollama Cloud API](https://docs.ollama.com/cloud), [pricing](https://ollama.com/pricing) and [structured-output limits](https://docs.ollama.com/capabilities/structured-outputs)
- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)
- [Notion database creation](https://developers.notion.com/reference/create-database), [data-source queries](https://developers.notion.com/reference/query-a-data-source) and [views](https://developers.notion.com/guides/data-apis/working-with-views)
