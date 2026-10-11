# Crunch Week

**Turn module handbooks into a semester you can see coming.**

A complete **React + TypeScript frontend** and **FastAPI backend** for the student-life hackathon. Upload module PDFs, review extracted deadlines, find crowded weeks, schedule study blocks, and sync the result into Notion.

The included demo needs no API keys. Running from this repository requires **Python 3.11/3.12** and **Node 22.12+ or 24 LTS**. The launchers install dependencies and build React on the first run. The separately supplied prebuilt project ZIP includes the compiled frontend and only requires Python to launch.

## Start in two minutes

1. Clone this repository and open a terminal inside it:

   ```sh
   git clone https://github.com/seancoughlan29/Hackathon-Notion.git
   cd Hackathon-Notion
   ```

2. Install Python **3.11 or 3.12** and Node **22.12+ or 24 LTS** if needed.
3. Run the launcher:

**Windows PowerShell**

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

**macOS / Linux**

```sh
sh start.sh
```

4. Open **http://127.0.0.1:8000** and click **Explore the demo**.

The execution-policy option affects this one launch only; it does not change your machine's saved policy. If you prefer, use the manual commands below. The first launch downloads Python dependencies. The app runs locally and stops with Ctrl+C.

## What's included

- Responsive dashboard with weekly deadline counts, module weights, a calendar, and upcoming assessments.
- PDF/TXT ingestion with size/page/text limits, PDF worker timeout, and explicit errors for scanned/encrypted files.
- Azure AI Foundry or OpenAI Responses API structured extraction into validated schemas, with source pages and excerpts.
- Review/edit/delete/manual-entry workflow. Editing a field clears its reviewed flag.
- Unknown deadlines stay visible; they are never silently converted to invented dates.
- Deterministic study planning with free weekdays, daily start time, daily capacity, days off, session length and deadline buffers.
- Explicit unscheduled-work reports when capacity is insufficient.
- Notion database, calendar view, deadline table and study table creation.
- Repeat syncs update entries by stable project/item keys. Student “Done” checkboxes are preserved. Old entries are marked superseded, not deleted.
- CSV, calendar ICS, and JSON backup/restore.
- Synthetic demo PDFs/TXT files, automated tests, Docker configuration, CI workflow, and a 60-second pitch guide.

## Enable real PDF extraction

Copy `.env.example` to `.env` in the root folder, beside `start.ps1`. Existing `.env` files are never overwritten by the app.

**Azure AI Foundry**: deploy an Azure OpenAI model that supports Responses structured outputs, then set:

```dotenv
AI_PROVIDER=azure
AZURE_OPENAI_ENDPOINT=https://YOUR-RESOURCE.services.ai.azure.com/openai/v1/
AZURE_OPENAI_API_KEY=your_resource_key
AZURE_OPENAI_DEPLOYMENT=your_exact_deployment_name
```

The deployment name can differ from the model name. Both `.services.ai.azure.com` and `.openai.azure.com` resource endpoints are supported. The endpoint can be the resource root or end in `/openai/v1/`; remove a trailing `responses` copied from the deployment Details panel. Do not use the Foundry project endpoint ending in `/api/projects/...`. This adapter uses API-key authentication and the v1 API, so no API-version, project ID, tenant ID, or separate OpenAI key is needed. Azure must allow key authentication and network access from the computer running FastAPI.

**Public OpenAI alternative**:

```dotenv
AI_PROVIDER=openai
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4.1-mini
```

Restart the backend after changes and refresh the browser. The provider is selected explicitly; Azure configuration never silently falls back to public OpenAI. `/api/config` reports missing configuration without returning keys. `ai_configured=true` means the settings are present and structurally valid, **not** that live credentials or quota have been tested. Upload a short synthetic TXT/PDF to verify the real connection. API calls may incur charges; the frontend requests permission to send document text to the selected provider. The app sends extracted text, not raw PDF files, and sets `store=False`. This does not override the provider's own data-retention policies.

In **Semester & availability**, set the semester start/end and planning start. Upload PDFs/TXT files, open each extracted assessment, verify its date/time/weight against the original, set remaining work, and mark it reviewed. AI extraction may miss assessments: compare the final list with your source documents, too.

No API keys go into the React source, browser storage, project backup, Git, or frontend build. Never use a `VITE_` variable for a secret.

### Limits and date handling

- Up to 5 files per upload flow, sequentially processed; 10 MB, 50 pages and 120,000 extracted characters per file; 300 assessments per project.
- Text-based PDFs and UTF-8 TXT only. OCR scans first. A PDF with any unreadable/blank page is rejected to avoid silently skipping scanned pages.
- Date-only deadlines remain date-only. Missing times do not become midnight/23:59.
- Missing years and bare “Week 10” deadlines remain unknown. A week + weekday may be proposed using the semester context, with a conversion note; review it carefully.
- Calendar weeks are consecutive seven-day intervals from the semester start, including holidays. A university's teaching-week convention may differ.
- Effort defaults to four editable hours per assessment. It is a starting estimate, **not** something the handbook or AI has established.
- Weightings are always per module. The app does not add unrelated module percentages into a misleading semester percentage.

## Connect Notion

1. Create an internal connection/integration in your Notion workspace. Grant **read, insert and update content** capabilities.
2. Create a normal parent page for your semester, then share/connect that page with the integration.
3. Set `NOTION_TOKEN` in `.env`. Optionally set `NOTION_PARENT_PAGE_ID` to the parent page UUID or URL. Restart FastAPI.
4. Open **Notion & exports**. Paste the parent page URL/ID (or use the configured default) and click **Create semester database**.
5. Review all assessments, then click **Sync to Notion**.

The backend uses Notion API version **2026-03-11** and the data-source API. It creates `Semester calendar`, `Deadlines`, and `Study plan` views, with semester-week and pressure fields on entries. Each view filters out superseded entries. A default Notion view may still show them, preserving history.

Save a JSON project backup after connecting. It includes your project identity and database/data-source IDs. Restore it before reconnecting on another browser/device. Loading the demo or starting a new project creates a new project identity. Do not rename/delete app-managed properties or manually duplicate rows with a `Crunch key`.

Sync is one way: edited app fields overwrite their Notion counterparts. It does not read Notion edits back into the app. The `Done` checkbox and other user-added properties are left untouched. To change the scheduling workload, update “Remaining work” in Crunch Week. Deleted local items become superseded on the next sync.

If a request fails midway, completed writes stay in Notion. The UI reports partial results; retry **Sync**, using the same project. Non-idempotent create calls are not blindly retried after ambiguous network/server failures. The next sync queries existing keys to reconcile completed writes. Avoid simultaneous syncs from different server processes; run one backend worker for this local version.

## Developer setup

From the root:

```sh
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
python -m pip install -r requirements-dev.txt
python -m uvicorn crunch_week.api:app --reload --host 127.0.0.1 --port 8000
```

In a second terminal (Node **22.12+ or 24 LTS**):

```sh
cd frontend
npm ci
npm run dev
```

Open **http://127.0.0.1:5173** for frontend development. Vite proxies `/api` to FastAPI on port 8000. The interactive API reference is at **http://127.0.0.1:8000/api/docs**.

To make a production frontend build:

```sh
cd frontend
npm run build
```

Restart FastAPI after the first build. It automatically serves `frontend/dist` from the same origin as the API. **After changing frontend code, rebuild it**; the launchers use the existing build if present.

### Docker

```sh
docker compose up --build
```

Then open http://127.0.0.1:8000. Compose loads optional root `.env` values and binds only to loopback. The image runs as a non-root user with a memory limit in Compose. Docker must be installed separately. See `docs/TEST_REPORT.md` for what was actually run on this release.

## Run checks

```sh
python -m ruff check crunch_week tests scripts
python -m pytest --cov=crunch_week --cov-report=term-missing
cd frontend
npm test
npm run build
npx playwright install chromium
# Start the production FastAPI server in another terminal on port 8000 first.
npm run test:e2e
```

The tests use mocked HTTP responses for paid/external APIs; they never call your live accounts. See `docs/TEST_REPORT.md` for release results and verification boundaries.

## Data and deployment boundaries

This is a complete local/single-operator hackathon application, **not a multi-tenant hosted service**. API keys belong to the operator. There is no account system or authorization between different remote users. Keep the default loopback binding. A shared deployment needs authenticated access, HTTPS, per-user secrets, isolation, quotas and durable storage before opening it publicly. An authenticated reverse proxy can support a trusted private demo, but does not make this a multi-tenant service.

The backend has no persistent document database. Upload bytes/text live during extraction and are then released; multipart processing may use temporary OS files. Project state, including source excerpts, lives in the browser tab's `sessionStorage` and is restored on refresh. Tab/session restoration behavior is browser-dependent; **download a backup before closing the tab**. Don't use a shared device for private module material. Clearing the project replaces local state; it does not delete earlier Notion exports.

PDF parsing runs in a child process with a 25-second timeout. On Linux it also has a 768 MB address-space cap; Windows has the time limit but no process memory cap. This is useful containment, not a hostile-file sandbox. Use the bounded Docker configuration for untrusted uploads and restrict who can access the service.

## Project map

```text
crunch_week/
  api.py          FastAPI routes, validation, upload bounds, static hosting
  models.py       Domain schemas, settings, timezone validation
  documents.py    PDF/TXT ingestion and bounded parsing worker
  extraction.py   OpenAI adapter, evidence checks, duplicate handling
  planner.py      Capacity-constrained scheduling and weekly summaries
  notion.py       Notion transport, database/views, repeat-safe sync
  exports.py      CSV and standards-compliant ICS generation
  demo.py         Clearly synthetic demo fixtures
frontend/src/
  App.tsx         Workspace orchestration and per-tab persistence
  components/     Dashboard, review, upload, availability, study and export UI
  api.ts          Typed HTTP boundary and downloads
  types.ts        Frontend data contracts
tests/            Backend and external-API contract tests
frontend/e2e/     Browser workflow tests
sample_data/      Synthetic PDF and TXT module handbooks
docs/            Architecture, testing, pitch and troubleshooting
```

## Official references used

- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses): schema-constrained extraction with the Python Responses parser. Local validation and human review remain necessary.
- [Notion database creation](https://developers.notion.com/reference/create-database) and [data-source queries](https://developers.notion.com/reference/query-a-data-source): database setup and retrieval of previously synced rows.
- [Notion views](https://developers.notion.com/guides/data-apis/working-with-views): calendar views configured with the date property's actual ID.
- [FastAPI file uploads](https://fastapi.tiangolo.com/tutorial/request-files/) and [Vite setup](https://vite.dev/guide/): multipart ingestion and frontend build setup.

See `docs/ARCHITECTURE.md`, `docs/DEMO_AND_PITCH.md` and `docs/TROUBLESHOOTING.md` for the design decisions, demo runbook and recovery steps.
