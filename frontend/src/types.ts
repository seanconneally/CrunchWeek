export type AssessmentKind =
  "Assignment" | "Exam" | "Project" | "Presentation" | "Quiz" | "Other";
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
}
export interface Settings {
  semester_start: string;
  semester_end: string;
  plan_from: string;
  timezone: string;
  weekdays: number[];
  day_start: string;
  daily_minutes: number;
  block_minutes: 30 | 60 | 90 | 120;
  buffer_days: number;
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
export interface Week {
  Week: number;
  Starting: string;
  Deadlines: number;
  "Effort (h)": number;
  "Module weights": Record<string, number>;
  Pressure: string;
}
export interface PlanResponse {
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
  ai_configured: boolean;
  ai_provider_name: string;
  ai_error: string | null;
  notion_configured: boolean;
  parent_configured: boolean;
  model: string;
}
export type Tab = "overview" | "assessments" | "study" | "notion";
