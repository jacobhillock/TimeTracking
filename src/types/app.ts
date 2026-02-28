import type { CSSProperties } from 'react'
import type { TimeEntry } from '../services/types'

export type ViewMode = 'task' | 'calendar'
export type EntriesByDate = Record<string, TimeEntry[]>
export type ClientColors = Record<string, string>
export type CollapsedSections = Record<string, boolean>
export type EditableTimeEntry = TimeEntry & { isNew?: boolean; dateKey?: string }

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
  isEntryUntracked?: (entry: TimeEntry) => boolean
  style?: CSSProperties
}
