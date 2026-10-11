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
