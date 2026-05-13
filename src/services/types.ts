export interface TimeEntry {
  id: number;
  startTime: string;
  endTime: string;
  client: string;
  ticket: string;
  description: string;
  disabled: boolean;
  tags?: string[];
}

export interface DayEntries {
  date: string; // yyyy-MM-dd format
  entries: TimeEntry[];
}

export interface Todo {
  id: number;
  description: string;
  client?: string;
  ticket?: string;
  completed: boolean;
  completedDate?: string; // yyyy-MM-dd format
  createdDate: string; // yyyy-MM-dd format
}

export interface TimeLogSummary {
  id: string;
  key: string;
  client: string;
  ticket: string;
  date: string; // yyyy-MM-dd format
  description: string;
  logged: boolean;
  totalMinutes: number;
  jiraId?: string;
}
