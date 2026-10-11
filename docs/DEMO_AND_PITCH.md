# Hackathon runbook

## Before the room gets busy

1. Check the event's rules on prebuilt code and disclose this starter implementation if required. The provided event text does not establish whether pre-event code is allowed.
2. Run the app and click **Explore the demo**. This exercises the complete planning UI without keys.
3. Configure your OpenAI key, Notion connection token, and a shared Notion parent page. Run a real extraction and sync in your own accounts before relying on them in a pitch.
4. Use actual module handbooks only with permission and verify their dates. No real university documents or survey results are included or invented.
5. For the included synthetic PDFs, set semester start to **2026-09-07**, end to **2026-11-30**, and a planning start before the deadlines. The one-click demo uses moving dates and therefore does not exactly match these fixed fixtures.
6. Keep a JSON backup of a verified semester. Save a short local screen recording of the working flow in case connectivity fails.

## 60-second pitch

**0–10 seconds: problem**

“Your deadlines are spread across handbooks. By the time you spot the week with four submissions, it's already crunch week.”

**10–25 seconds: source to structure**

Upload a short, verified handbook section. Show the assessments table and one source excerpt. Explain: “AI finds the details; we check them against the source.” For a slow API connection, restore your pre-reviewed backup and say so openly.

**25–40 seconds: the insight**

Show the weekly chart and the four-deadline week. “These percentages belong to different modules, so we keep them separate. You tell us the hours you still need.” Click the busy week and point out the assessments.

**40–52 seconds: action**

Open the study plan. Show the scheduled blocks. Reduce available hours briefly to demonstrate that the app reports unscheduled work rather than pretending everything fits. Restore your usual availability.

**52–60 seconds: Notion**

Sync the already-connected semester and open its calendar. “From scattered PDFs to a reviewed semester plan, in the workspace you're already using.”

Use a small plan for the live sync: Notion rate limits mean a large semester takes longer than a one-minute pitch. Pre-create and sync your demonstration database, then show a single edit updating live.

## Five-person ownership

| Person | Demo-day responsibility |
|---|---|
| Extraction | Tune and evaluate on permitted real handbooks; check missing and uncertain dates |
| Notion | Configure connection access; rehearse database creation and repeat sync |
| React | Own usability, visual polish, mobile checks and upload/review flow |
| Planner | Validate availability, timezones, shortfalls and effort estimates |
| Pitch/research | Gather consented feedback, verify claims, rehearse and keep backups |

Do not claim a survey statistic unless you collected it. Record the exact question, number of respondents and response counts; a small convenience sample is feedback, not a representative student survey.

## Demo fallback ladder

1. Live permitted PDF extraction and Notion sync.
2. Restore a verified JSON backup, then sync it live.
3. Use the clearly labelled synthetic demo and show the real local calendar/CSV exports.

The fallback still demonstrates review, clash detection, scheduling and capacity reporting. Say which mode is running.
