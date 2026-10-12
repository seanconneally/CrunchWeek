"""Trusted help content shared by local FAQ matching and AI topic routing."""

import re

HELP = {
    "overview": "Crunch Week plans study around confirmed assessments and your free hours. Start with Semester & availability, add or upload assessments, check their details, then use Today for your next session. I can help with scheduling changes or explain where app features are; I cannot write coursework or act as a general chatbot.",
    "availability": "Open Semester & availability in the sidebar (the semester card on mobile). Set semester dates and free hours under Your week, your hours. Work, training and classes go under Today → Add work or training, and block study during those times. Saving rebuilds your plan.",
    "commitments": "Choose Add training with chat on Today or the welcome screen. Tell me the exact days and start/end times (say every week for recurring training), review the proposal, then Confirm changes & replan. Nothing changes until you confirm. For manual entry, on Today choose Add work or training, then Add work, training or a class. Give it a name, choose Every week or One date, and enter exact start/end times. Save commitments & rebuild applies it. You can also describe those exact details here and review a proposal before confirming.",
    "upload": "Choose Upload handbooks in the page header. Select your PDF, Word or other supported document, confirm permission to send its text to your configured AI provider, then extract. Open Assessments afterwards to verify dates, times and weighting against the quoted source; unreviewed entries stay out of the study plan.",
    "assessments": "Open Assessments, then Add assessment or Edit beside an existing item. Check its source, deadline, weighting and remaining hours. Tick I checked the date, time and weighting against the source, then Save assessment. Unknown dates need manual confirmation before the app can schedule study.",
    "focus": "Choose Start focus on a session in Today or Study plan. Pause/resume as needed; the timer survives navigation and reloads on this device. When it ends, Log N min records the session. It never logs automatically.",
    "progress": "After a session, choose Done (or Log N min in the focus timer). On track keeps the updated estimate; Need more time lets you confirm revised remaining hours; Finished clears study work but does not submit the assessment. Today → Recent activity has Undo and Check progress for the latest unchecked completed session.",
    "recovery": "When study cannot fit, choose Make room on Today or Study plan. Compare the added dates/hours, affected assessments and remaining unscheduled work before choosing Use this option. If nothing can help within your free time, edit your availability or remaining-work estimate directly.",
    "checklist": "Open an assessment in Assessments to add checklist steps or Use a starter checklist. Ticks save immediately and are reversible. Checklist ticks track tasks separately from remaining study hours and submission status.",
    "exports": "Open Exports for an ICS calendar, CSV spreadsheet or project backup. The calendar is a snapshot: export again after changes and replace the old imported calendar. Optional Notion is under the same tab. Download/restore backup buttons are also in the sidebar.",
    "semesters": "Choose Semesters in the page header or Saved semesters in the sidebar to switch. New semester starts another plan without deleting earlier ones. Changes are saved in this browser on this device; download a project backup to move devices or keep a separate copy. Accounts and cloud sync are not available yet.",
    "limits": "Chat is for scheduling and app help, with 25 messages per day across this local app's semesters. The counter survives reloads and restarts and resets at midnight in Europe/Dublin. Common help answers are local and need no AI call. Direct edits, check-ins and preview confirmation do not use chat messages.",
}
TOPICS = {
    "limits": r"limit|quota|messages? (?:left|remaining|per day)|25|cost",
    "upload": r"upload|import|extract|handbook|scrap|pdf|document",
    "focus": r"focus|timer|pause|resume",
    "checklist": r"checklist|steps|tick",
    "exports": r"export|backup|restore|notion|calendar|ics|csv",
    "semesters": r"saved semester|new semester|switch|device|sync|account",
    "commitments": r"training|work shift|commitment|lecture|class|work or training",
    "recovery": r"make room|unscheduled|shortfall|cannot fit|can't fit",
    "progress": r"on track|need more time|finished|done|progress|undo|log|remaining|submitted",
    "availability": r"availability|study hours|free hours|semester dates|weekly goal|goal",
    "assessments": r"assessment|deadline|review|weight|source",
}
OUT_OF_SCOPE = "I can help with scheduling changes and using Crunch Week. For example, tell me an exact work/training time, update remaining study hours, or ask where to find a feature. I cannot write coursework or answer unrelated general questions."


def local_help(text: str) -> tuple[str, str] | None:
    text = text.strip().lower()
    if not re.match(r"^(?:how|where|what|can you explain|explain|help|why|show me)\b", text):
        return None
    if re.search(r"write (?:me |my |an? )?(?:essay|report|assignment)|solve|homework|ignore .*instructions", text):
        return None
    # Only explicit interface/how-to questions use local answers, never requests
    # to query a student's actual deadlines or mutate their schedule.
    if not re.search(r"how|where|how do|how can|how does|feature|button|app|crunch week|limit|quota", text):
        return None
    for topic, pattern in TOPICS.items():
        if re.search(pattern, text):
            return topic, HELP[topic]
    if re.search(r"app|crunch week|help", text):
        return "overview", HELP["overview"]
    return None
