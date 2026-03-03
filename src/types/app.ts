import type { CSSProperties } from 'react'
import type { TimeEntry } from '../services/types'

export type ViewMode = 'task' | 'calendar'
export type EntriesByDate = Record<string, TimeEntry[]>
export type ClientColors = Record<string, string>
export type CollapsedSections = Record<string, boolean>
export type EditableTimeEntry = TimeEntry & { isNew?: boolean; dateKey?: string }

export interface PinnedTicket {
  key: string
  client: string
  ticket: string
  friendlyName?: string
  pinnedAt: string
}

export interface TicketOption {
  key: string
  client: string
  ticket: string
  source: 'pinned' | 'todo' | 'recent'
  friendlyName?: string
  lastLoggedDate?: string
  sortByRecentDate?: string
}

export interface TicketOptionGroups {
  pinned: TicketOption[]
  todos: TicketOption[]
  recent: TicketOption[]
}

export interface CalendarViewProps {
  entries: EntriesByDate
  currentDate: Date
  onAddEntry: (specificDateKey: string, newEntry: EditableTimeEntry) => void
  onUpdateEntry: (updatedEntry: TimeEntry, newDateKey?: string) => Promise<{ shouldClose: boolean }>
  onDeleteEntry: (specificDateKey: string, entryId: number) => void
  clients: string[]
  clientColors: ClientColors
  defaultStartTime: string
  intervalMinutes: number
  calendarStartTime: string
  calendarEndTime: string
  onEditEntry: (entry: EditableTimeEntry | null, dateKey: string | null) => void
  editingEntry: EditableTimeEntry | null
  editingEntryDateKey: string | null
  ticketOptions: TicketOptionGroups
  isEntryUntracked?: (entry: TimeEntry) => boolean
  style?: CSSProperties
}

export interface TaskViewProps {
  dayEntries: TimeEntry[]
  clients: string[]
  defaultStartTime: string
  onUpdateDayEntries: (newEntries: TimeEntry[]) => void
  getJiraUrl: (client?: string, ticket?: string) => string | undefined
  isEntryUntracked: (entry: TimeEntry) => boolean
}
