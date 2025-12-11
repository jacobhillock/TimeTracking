export interface TimeEntry {
  id: number;
  startTime: string;
  endTime: string;
  client: string;
  ticket: string;
  description: string;
  disabled: boolean;
}

export interface DayEntries {
  date: string; // yyyy-MM-dd format
  entries: TimeEntry[];
}
