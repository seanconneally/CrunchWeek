export type AssessmentKind =
  "Assignment" | "Exam" | "Project" | "Presentation" | "Quiz" | "Other";
export interface Task {
  id: string;
  title: string;
  done: boolean;
}
export interface StudyWindow {
  weekday: number;
  start: string;
  minutes: number;
}
export interface Commitment {
  id: string;
  date: string | null;
  title: string;
  weekday: number;
  start: string;
  end: string;
}
export interface ExtraWindow {
  date: string;
  start: string;
  minutes: number;
}
export interface RecoveryOption {
  id: "buffer" | "extra" | "combined";
  title: string;
  recovered_minutes: number;
  remaining_minutes: number;
  added_minutes: number;
  extra_windows: ExtraWindow[];
  buffer_days: number;
  settings: Settings;
  impacts: {
    assessment_id: string;
    module: string;
    title: string;
    due_date: string | null;
    before_minutes: number;
    after_minutes: number;
  }[];
}
export interface RecoveryResponse {
  planned_at: string;
  baseline_minutes: number;
  shortfalls: PlanResponse["plan"]["shortfalls"];
  options: RecoveryOption[];
}
export interface Assessment {
  id: string;
  module: string;
  title: string;
  kind: AssessmentKind;
  due_date: string | null;
  due_time: string | null;
  weight_percent: number | null;
  effort_minutes: number;
  source_file: string;
  source_page: number | null;
  evidence: string;
  notes: string;
  reviewed: boolean;
  completed: boolean;
  tasks: Task[];
}
export interface Settings {
  availability_confirmed?: boolean;
  semester_start: string;
  semester_end: string;
  plan_from: string;
  timezone: string;
  weekdays: number[];
  weekly_windows: StudyWindow[];
  weekly_goal_minutes: number;
  commitments: Commitment[];
  extra_windows: ExtraWindow[];
  day_start: string;
  daily_minutes: number;
  block_minutes: 30 | 60 | 90 | 120;
  buffer_days: number;
  reminder_minutes: 0 | 5 | 10 | 15 | 30 | 60;
  deadline_reminder_days: 0 | 1 | 2 | 7;
  planning_style: "steady" | "deadline";
  days_off: string[];
}
export interface NotionTarget {
  database_id: string;
  data_source_id: string;
}
export interface Project {
  version: 1;
  id: string;
  name: string;
  settings: Settings;
  assessments: Assessment[];
  notion: NotionTarget | null;
  demo: boolean;
  study_history: StudyActivity[];
}
export interface StudyBlock {
  id: string;
  assessment_id: string;
  module: string;
  title: string;
  start: string;
  end: string;
  minutes: number;
}
export interface StudyActivity extends StudyBlock {
  state: "done" | "skipped";
  logged_at: string | null;
  remaining_before: number | null;
  feedback: CheckInStatus | null;
  feedback_previous_remaining: number | null;
  reported_remaining: number | null;
}
export type StudyAction = "done" | "skipped" | "undo";
export interface Week {
  Week: number;
  Starting: string;
  Deadlines: number;
  "Effort (h)": number;
  "Module weights": Record<string, number>;
  Pressure: string;
  "Capacity (h)": number;
  "Planned (h)": number;
  "Load percent": number;
}
export interface PlanResponse {
  planned_at: string;
  plan: {
    blocks: StudyBlock[];
    shortfalls: {
      assessment_id: string;
      label: string;
      minutes: number;
      reason: string;
    }[];
    warnings: string[];
  };
  weeks: Week[];
  warnings: string[];
}
export interface Config {
  chat_provider?: "ollama" | "ollama_cloud" | "azure" | "openai";
  chat_configured?: boolean;
  chat_provider_name?: string;
  chat_model?: string;
  chat_local?: boolean;
  chat_error?: string | null;
  ai_configured: boolean;
  ai_provider_name: string;
  ai_error: string | null;
  notion_configured: boolean;
  parent_configured: boolean;
  model: string;
}
export type Tab = "today" | "overview" | "assessments" | "study" | "notion";

export type CheckInStatus = "on_track" | "need_more_time" | "finished";
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
export interface ChatImpact {
  remaining_minutes: number;
  scheduled_minutes: number;
  unscheduled_minutes: number;
  next_week_available_minutes: number;
}
export interface ChatProposal {
  usage?: ChatUsage | null;
  project_id: string;
  review_signature: string;
  base_signature: string;
  created_at: string;
  message: string;
  questions: string[];
  commitment_changes: { before: Commitment | null; after: Commitment | null }[];
  effort_changes: {
    assessment_id: string;
    before_minutes: number;
    after_minutes: number;
  }[];
  before: ChatImpact;
  after: ChatImpact;
  warnings: string[];
}

export interface ChatUsage {
  limit: number;
  used: number;
  remaining: number;
  reset_at: string;
  timezone: string;
}
