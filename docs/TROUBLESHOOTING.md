# Troubleshooting

| Symptom | What to do |
|---|---|
| Browser cannot connect | Keep the launcher terminal open; confirm `/api/health` returns `{"status":"ok"}` at port 8000. Check whether another process uses that port. |
| `python` not found | Install Python 3.11/3.12 and add it to PATH. On Windows you can run the manual commands with `py -3.11` instead. |
| Frontend is missing | Install Node 22.12+ or 24, run `npm ci` and `npm run build` in `frontend`, then restart FastAPI. |
| Changes do not appear | Rebuild React or use Vite dev mode at port 5173. Production serves the compiled `dist` folder. |
| AI extraction disabled | Set `AI_PROVIDER=azure` plus all three `AZURE_OPENAI_*` values, or `AI_PROVIDER=openai` plus `OPENAI_API_KEY`, in the root `.env`. Restart FastAPI and refresh the browser. The upload dialog lists missing settings. |
| Azure endpoint rejected | Use the HTTPS resource root or `/openai/v1/` base URL. Remove a trailing `responses`; do not use the project URL containing `/api/projects/`. |
| AI 401/403 | Check that the key belongs to the endpoint/resource. Azure also requires key authentication to be enabled and network access from the backend host. A ChatGPT subscription is not an API credential. |
| AI 404 | For Azure, `AZURE_OPENAI_DEPLOYMENT` must match the exact deployment name, not the resource or model-family name. For OpenAI, check `OPENAI_MODEL` and project access. |
| AI 400 | Confirm the deployment supports Responses with structured outputs. Try a small TXT file first. |
| AI 429 | Check API quota/billing and rate limits. Wait before retrying. The local demo still works. |
| Old environment values still used | Process environment variables take precedence over `.env`. Restart from a terminal without old overrides. |
| Scanned PDF/blank page | OCR the file or remove blank pages. Alternatively upload a UTF-8 TXT assessment section. |
| Document too long | Upload just the module's assessment section. The app does not silently truncate the document. |
| Extraction failed after earlier files succeeded | Earlier files are saved. Retry the failed file; identical re-uploads preserve existing entries. |
| Date cleared or unknown | Check the source, edit the deadline and notes, then mark reviewed. Never guess an exam timetable. |
| Weight total over 100% | Check duplicate entries, alternative assessments, or weights defined within a subcomponent instead of the whole module. |
| Unscheduled work | Increase genuinely free hours, add free weekdays, reduce the buffer, or revise remaining effort. Check dates outside the semester. |
| Notion 404 | Share the parent page/database with the connection. A valid page URL alone is not enough. |
| Notion 400/schema rejection | Restore original property names/types. Use a database created by this app. |
| Notion sync interrupted | Keep the same project, wait, then retry Sync. Do not create a new project or duplicate the database. |
| Notion rows synced but views missing | Retry Sync to retry view setup; the row data is already there. Ensure update/insert permissions. |
| Duplicate Crunch keys | Keep one Notion row for each duplicated key; the app deliberately stops before choosing between duplicates. |
| Project disappeared after closing tab | Restore the downloaded JSON backup. The application has no server-side project store. |
| Browser refresh during extraction | Extraction may continue on the server but the result is not persisted there. Wait for it to finish before retrying; previously saved project state remains. |
| Existing database cannot reconnect | Restore its original JSON project backup first. Different project UUIDs intentionally own different rows. |
| Calendar import duplicates | Remove/replace the dedicated imported calendar. ICS downloads are snapshots, not subscriptions. |

For a reproducible bug report, include the action, sanitized error text, Python/Node versions, and a synthetic file that reproduces the issue. Do not include `.env`, API keys, private handbooks or raw debug dumps containing them.
