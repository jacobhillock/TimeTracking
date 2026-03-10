import { lazy, Suspense, useState, useEffect, useRef } from 'react'
import type { CSSProperties, RefObject } from 'react'
import { migrateFromLocalStorage } from './services/db'
import { getEntriesForDay, getEntriesForDays, setEntriesForDay, moveEntry, findOverlappingEntries } from './services/timeEntryService'
import { getAllTodos, addTodo, toggleTodoCompletion, deleteTodo, updateTodo } from './services/todoService'
import type { TimeEntry, Todo } from './services/types'
import type { ClientColors, CollapsedSections, EditableTimeEntry, EntriesByDate, PinnedTicket, TicketOption, TicketOptionGroups, ViewMode } from './types/app'
import useLocalStorageState, { STORAGE_KEYS } from './hooks/useLocalStorageState'
import SearchModal from './SearchModal'
import CollapsibleSection from './components/CollapsibleSection'
import Toaster from './components/Toaster'
import { notifyErrorToast } from './services/toastService'
import { Checkbox } from '@base-ui-components/react/checkbox'
import { Input } from '@base-ui-components/react/input'

const CalendarView = lazy(() => import('./components/CalendarView'))
const TaskView = lazy(() => import('./components/TaskView'))

interface SummaryItem {
  key: string
  client: string
  ticket: string
  minutes: number
  descriptions: string[]
  allDisabled: boolean
  someDisabled: boolean
  entryIds: number[]
  isUntracked: boolean
  hours: string
  isIndeterminate: boolean
}

interface SummaryAccumulator {
  client: string
  ticket: string
  minutes: number
  descriptions: string[]
  allDisabled: boolean
  someDisabled: boolean
  entryIds: number[]
  isUntracked: boolean
}

interface OverlapConfirmState {
  entry: TimeEntry
  fromDateKey: string
  toDateKey: string
}

interface TicketRecentStats {
  client: string
  ticket: string
  lastLoggedDate?: string
}

interface TodoFormFieldsProps {
  description: string
  descriptionRef: RefObject<HTMLTextAreaElement | null>
  onDescriptionChange: (value: string) => void
  onDescriptionInput: (element: HTMLTextAreaElement) => void
  clientValue: string
  onClientChange: (value: string) => void
  clients: string[]
  ticketValue: string
  onTicketChange: (value: string) => void
  descriptionClassName?: string
  descriptionStyle?: CSSProperties
  rowStyle?: CSSProperties
  clientSelectClassName?: string
  clientSelectStyle?: CSSProperties
  ticketInputClassName?: string
  ticketInputStyle?: CSSProperties
}

function getContrastColor(hexColor: string): string {
  const hex = hexColor.replace('#', '')
  const r = parseInt(hex.substr(0, 2), 16)
  const g = parseInt(hex.substr(2, 2), 16)
  const b = parseInt(hex.substr(4, 2), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5 ? '#000000' : '#ffffff'
}

const parseCurrentView = (rawValue: string): ViewMode => {
  return rawValue === 'task' || rawValue === 'calendar' ? rawValue : 'calendar'
}

const parseNumber = (fallback: number) => (rawValue: string): number => {
  const parsed = Number(rawValue)
  return Number.isFinite(parsed) ? parsed : fallback
}

const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const parseTimeValue = (value: string): { hours: number; minutes: number } | null => {
  const [hoursRaw, minutesRaw] = value.split(':')
  const hours = Number(hoursRaw)
  const minutes = Number(minutesRaw)

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return null
  }
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null
  }

  return { hours, minutes }
}

const buildDateWithTime = (baseDate: Date, timeValue: string): Date | null => {
  const parsed = parseTimeValue(timeValue)
  if (!parsed) return null

  return new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate(),
    parsed.hours,
    parsed.minutes,
    0,
    0
  )
}

const isReminderDue = (timeValue: string | null, lastShownDate: string | null, now: Date): boolean => {
  if (!timeValue) return false

  const todayKey = formatLocalDate(now)
  if (lastShownDate === todayKey) return false

  const scheduled = buildDateWithTime(now, timeValue)
  if (!scheduled) return false

  return now >= scheduled
}

const toLocalNoon = (date: Date): Date => {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0)
}

const dateKeyToLocalNoon = (value: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null
  }

  const [yearRaw, monthRaw, dayRaw] = value.split('-')
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const day = Number(dayRaw)

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null
  }
  if (month < 1 || month > 12) {
    return null
  }

  const maxDay = new Date(year, month, 0).getDate()
  if (day < 1 || day > maxDay) {
    return null
  }

  return new Date(year, month - 1, day, 12, 0, 0, 0)
}

const normalizeTicketPart = (value: string): string => value.trim()

const toTicketKey = (client: string, ticket: string): string =>
  `${normalizeTicketPart(client)}-${normalizeTicketPart(ticket)}`

const toTicketKeyLookup = (client: string, ticket: string): string =>
  toTicketKey(client, ticket).toLowerCase()

const autoResizeTextarea = (element: HTMLTextAreaElement | null): void => {
  if (!element) return
  element.style.height = 'auto'
  element.style.height = `${element.scrollHeight}px`
}

function TodoFormFields({
  description,
  descriptionRef,
  onDescriptionChange,
  onDescriptionInput,
  clientValue,
  onClientChange,
  clients,
  ticketValue,
  onTicketChange,
  descriptionClassName = 'todo-textarea',
  descriptionStyle = { marginBottom: '8px' },
  rowStyle = { display: 'flex', gap: '8px', marginBottom: '8px' },
  clientSelectClassName = 'todo-form-field',
  clientSelectStyle = { flex: 1 },
  ticketInputClassName = 'todo-form-field',
  ticketInputStyle = { flex: 1 }
}: TodoFormFieldsProps) {
  return (
    <>
      <textarea
        placeholder="Todo description"
        value={description}
        ref={descriptionRef}
        onChange={(e) => onDescriptionChange(e.target.value)}
        onInput={(e) => onDescriptionInput(e.currentTarget)}
        style={descriptionStyle}
        className={descriptionClassName}
      />
      <div style={rowStyle}>
        <select
          value={clientValue}
          onChange={(e) => onClientChange(e.target.value)}
          className={clientSelectClassName}
          style={clientSelectStyle}
        >
          <option value="">Optional client</option>
          {clients.map(client => (
            <option key={client} value={client}>{client}</option>
          ))}
        </select>
        <Input
          type="text"
          placeholder="Ticket #"
          value={ticketValue}
          onValueChange={(value) => onTicketChange(value)}
          className={ticketInputClassName}
          style={ticketInputStyle}
        />
      </div>
    </>
  )
}

const getRecentDateKeys = (anchorDate: Date): string[] => {
  const keys: string[] = []
  for (let i = 0; i <= 7; i++) {
    const date = new Date(anchorDate)
    date.setDate(date.getDate() - i)
    keys.push(formatLocalDate(date))
  }
  return keys
}

const sortTicketOptions = (a: TicketOption, b: TicketOption): number => {
  const dateA = a.sortByRecentDate || ''
  const dateB = b.sortByRecentDate || ''
  if (dateA !== dateB) {
    return dateB.localeCompare(dateA)
  }
  return a.key.localeCompare(b.key)
}

function App() {
  const [currentDate, setCurrentDate] = useState(() => toLocalNoon(new Date()))
  const [currentView, setCurrentView] = useLocalStorageState<ViewMode>(STORAGE_KEYS.CURRENT_VIEW, 'calendar', {
    parse: parseCurrentView
  })
  const [entries, setEntries] = useState<EntriesByDate>({})
  const [isLoadingEntries, setIsLoadingEntries] = useState(true)
  const [clients, setClients] = useLocalStorageState<string[]>(STORAGE_KEYS.CLIENTS, [])
  const [clientColors, setClientColors] = useLocalStorageState<ClientColors>(STORAGE_KEYS.CLIENT_COLORS, {})
  const [jiraBaseUrl, setJiraBaseUrl] = useLocalStorageState<string>(STORAGE_KEYS.JIRA_BASE_URL, '')
  const [defaultStartTime, setDefaultStartTime] = useLocalStorageState<string>(STORAGE_KEYS.DEFAULT_START_TIME, '09:00')
  const [calendarInterval, setCalendarInterval] = useLocalStorageState<number>(STORAGE_KEYS.CALENDAR_INTERVAL, 15, {
    parse: parseNumber(15),
    serialize: (value) => String(value)
  })
  const [calendarStartTime, setCalendarStartTime] = useLocalStorageState<string>(STORAGE_KEYS.CALENDAR_START_TIME, '00:00')
  const [calendarEndTime, setCalendarEndTime] = useLocalStorageState<string>(STORAGE_KEYS.CALENDAR_END_TIME, '23:59')
  const [openReminderTime, setOpenReminderTime] = useLocalStorageState<string | null>(STORAGE_KEYS.OPEN_REMINDER_TIME, null)
  const [closeReminderTime, setCloseReminderTime] = useLocalStorageState<string | null>(STORAGE_KEYS.CLOSE_REMINDER_TIME, null)
  const [lastOpenReminderDate, setLastOpenReminderDate] = useLocalStorageState<string | null>(STORAGE_KEYS.LAST_OPEN_REMINDER_DATE, null)
  const [lastCloseReminderDate, setLastCloseReminderDate] = useLocalStorageState<string | null>(STORAGE_KEYS.LAST_CLOSE_REMINDER_DATE, null)
  const [editingEntry, setEditingEntry] = useState<EditableTimeEntry | null>(null)
  const [editingEntryDateKey, setEditingEntryDateKey] = useState<string | null>(null)
  const [showOverlapConfirm, setShowOverlapConfirm] = useState<OverlapConfirmState | null>(null)
  const [darkMode, setDarkMode] = useLocalStorageState<boolean>(STORAGE_KEYS.DARK_MODE, false)
  const [sidebarVisible, setSidebarVisible] = useLocalStorageState<boolean>(STORAGE_KEYS.SIDEBAR_VISIBLE, true)
  const [collapsedSections, setCollapsedSections] = useLocalStorageState<CollapsedSections>(STORAGE_KEYS.COLLAPSED_SECTIONS, {})
  const [pinnedTickets, setPinnedTickets] = useLocalStorageState<PinnedTicket[]>(STORAGE_KEYS.PINNED_TICKETS, [])
  const [newClient, setNewClient] = useState('')
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [now, setNow] = useState<Date>(() => new Date())
  const [activeReminder, setActiveReminder] = useState<'open' | 'close' | null>(null)
  const [clickedSummary, setClickedSummary] = useState<SummaryItem | null>(null)
  const [showLogPrompt, setShowLogPrompt] = useState(false)
  const [todos, setTodos] = useState<Todo[]>([])
  const [newTodoDescription, setNewTodoDescription] = useState('')
  const [newTodoClient, setNewTodoClient] = useState('')
  const [newTodoTicket, setNewTodoTicket] = useState('')
  const [editingTodoId, setEditingTodoId] = useState<number | null>(null)
  const [editTodoDescription, setEditTodoDescription] = useState('')
  const [editTodoClient, setEditTodoClient] = useState('')
  const [editTodoTicket, setEditTodoTicket] = useState('')
  const newTodoDescriptionRef = useRef<HTMLTextAreaElement | null>(null)
  const editTodoDescriptionRef = useRef<HTMLTextAreaElement | null>(null)
  const [friendlyNameDrafts, setFriendlyNameDrafts] = useState<Record<string, string>>({})
  const headerRef = useRef<HTMLDivElement | null>(null)
  const [headerHeight, setHeaderHeight] = useState(0)
  const nowTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nowIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const openReminderTimeRef = useRef<string | null>(openReminderTime)
  const closeReminderTimeRef = useRef<string | null>(closeReminderTime)
  const lastOpenReminderDateRef = useRef<string | null>(lastOpenReminderDate)
  const lastCloseReminderDateRef = useRef<string | null>(lastCloseReminderDate)
  const activeReminderRef = useRef<'open' | 'close' | null>(null)
  const windowWasBlurred = useRef<boolean>(false)
  const friendlyNameTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const loadedRecentDateKeysRef = useRef<Set<string>>(new Set())

  openReminderTimeRef.current = openReminderTime
  closeReminderTimeRef.current = closeReminderTime
  lastOpenReminderDateRef.current = lastOpenReminderDate
  lastCloseReminderDateRef.current = lastCloseReminderDate
  activeReminderRef.current = activeReminder

  const dateKey = formatLocalDate(currentDate)

  useEffect(() => {
    const handleBlur = () => {
      windowWasBlurred.current = true
    }

    const handleFocus = () => {
      if (windowWasBlurred.current && clickedSummary && !clickedSummary.allDisabled && !clickedSummary.isUntracked) {
        setShowLogPrompt(true)
      }
      windowWasBlurred.current = false
    }

    window.addEventListener('blur', handleBlur)
    window.addEventListener('focus', handleFocus)

    return () => {
      window.removeEventListener('blur', handleBlur)
      window.removeEventListener('focus', handleFocus)
    }
  }, [clickedSummary])

  useEffect(() => {
    async function initializeDB() {
      try {
        await migrateFromLocalStorage()
        console.log('Database initialized and migration complete')
      } catch (error) {
        console.error('Failed to initialize database:', error)
        notifyErrorToast('Initialization failed', 'Failed to initialize database. Attempting local fallback.')
        const saved = localStorage.getItem('timeEntries')
        if (saved) {
          try {
            const parsed = JSON.parse(saved)
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              setEntries(parsed as EntriesByDate)
            }
          } catch (parseError) {
            console.warn('Failed to parse legacy localStorage timeEntries', parseError)
            notifyErrorToast('Recovery failed', 'Could not parse legacy time entries from local storage.')
          }
        }
      } finally {
        setIsLoadingEntries(false)
      }
    }

    initializeDB()
  }, [])

  useEffect(() => {
    async function loadCurrentDayEntries() {
      if (isLoadingEntries) return

      if (currentView === 'task') {
        // Task view: load only current day
        if (!entries[dateKey]) {
          const dayEntries = await getEntriesForDay(dateKey)
          if (dayEntries.length > 0) {
            setEntries(prev => ({ ...prev, [dateKey]: dayEntries }))
          }
        }
      } else if (currentView === 'calendar') {
        // Calendar view: load business week
        const d = new Date(currentDate)
        const day = d.getDay()
        const diff = d.getDate() - day + (day === 0 ? -2 : 1)
        const monday = new Date(d.setDate(diff))
        const weekDates = []

        for (let i = 0; i < 5; i++) {
          const date = new Date(monday)
          date.setDate(date.getDate() + i)
          weekDates.push(formatLocalDate(date))
        }

        // Only fetch dates we don't have yet
        const datesToFetch = weekDates.filter(date => !entries[date])

        if (datesToFetch.length > 0) {
          const weekEntries = await getEntriesForDays(datesToFetch)
          if (Object.keys(weekEntries).length > 0) {
            setEntries(prev => ({ ...prev, ...weekEntries }))
          }
        }
      }
    }

    loadCurrentDayEntries()
  }, [currentDate, currentView, isLoadingEntries, dateKey])

  useEffect(() => {
    document.body.classList.toggle('dark-mode', darkMode)
  }, [darkMode])

  useEffect(() => {
    const clearNowTimers = (): void => {
      if (nowTimeoutRef.current) {
        clearTimeout(nowTimeoutRef.current)
        nowTimeoutRef.current = null
      }
      if (nowIntervalRef.current) {
        clearInterval(nowIntervalRef.current)
        nowIntervalRef.current = null
      }
    }

    const syncNow = (): void => {
      const nextNow = new Date()
      setNow(nextNow)
      evaluateRemindersNow(nextNow)
    }
    const isActive = (): boolean => document.visibilityState === 'visible'

    const scheduleNowUpdates = (): void => {
      clearNowTimers()

      if (!isActive()) {
        return
      }

      syncNow()
      const timestamp = new Date()
      const delayToNextMinute = Math.max(0, (60 - timestamp.getSeconds()) * 1000 - timestamp.getMilliseconds())

      nowTimeoutRef.current = setTimeout(() => {
        syncNow()
        nowIntervalRef.current = setInterval(syncNow, 60_000)
      }, delayToNextMinute)
    }

    const handleActivityChange = (): void => {
      if (isActive()) {
        scheduleNowUpdates()
        return
      }

      clearNowTimers()
    }

    scheduleNowUpdates()
    document.addEventListener('visibilitychange', handleActivityChange)

    return () => {
      clearNowTimers()
      document.removeEventListener('visibilitychange', handleActivityChange)
    }
  }, [])

  useEffect(() => {
    const loadTodos = async () => {
      const filteredTodos = await getAllTodos(dateKey)
      setTodos(filteredTodos)
    }
    loadTodos()
  }, [dateKey])

  useEffect(() => {
    autoResizeTextarea(newTodoDescriptionRef.current)
  }, [newTodoDescription])

  useEffect(() => {
    autoResizeTextarea(editTodoDescriptionRef.current)
  }, [editTodoDescription, editingTodoId])

  useEffect(() => {
    if (isLoadingEntries) return

    const recentDateKeys = getRecentDateKeys(currentDate)
    const missingDateKeys = recentDateKeys.filter((key) => !loadedRecentDateKeysRef.current.has(key))

    if (missingDateKeys.length === 0) return

    missingDateKeys.forEach((key) => loadedRecentDateKeysRef.current.add(key))

    let cancelled = false
    const loadRecentEntries = async () => {
      try {
        const recentEntries = await getEntriesForDays(missingDateKeys)
        if (cancelled) return

        setEntries((prev) => {
          const next = { ...prev }
          missingDateKeys.forEach((key) => {
            if (next[key] === undefined) {
              next[key] = recentEntries[key] || []
            }
          })
          return next
        })
      } catch (error) {
        missingDateKeys.forEach((key) => loadedRecentDateKeysRef.current.delete(key))
        console.error('Failed to load recent entries:', error)
      }
    }

    void loadRecentEntries()

    return () => {
      cancelled = true
    }
  }, [currentDate, isLoadingEntries])

  useEffect(() => {
    setFriendlyNameDrafts((prev) => {
      const next: Record<string, string> = {}
      pinnedTickets.forEach((ticket) => {
        next[ticket.key] = prev[ticket.key] ?? ticket.friendlyName ?? ''
      })
      return next
    })
  }, [pinnedTickets])

  useEffect(() => {
    return () => {
      Object.values(friendlyNameTimersRef.current).forEach((timer) => {
        clearTimeout(timer)
      })
      friendlyNameTimersRef.current = {}
    }
  }, [])

  const updateDayEntries = (newEntries: TimeEntry[], specificDateKey: string | null = null): void => {
    const key = specificDateKey || dateKey
    setEntries(prev => ({ ...prev, [key]: newEntries }))

    setEntriesForDay(key, newEntries).catch(error => {
      console.error('Failed to sync entries to IndexedDB:', error)
    })
  }

  const addCalendarEntry = (specificDateKey: string, newEntry: EditableTimeEntry): void => {
    const dayEntries = entries[specificDateKey] || []
    updateDayEntries([...dayEntries, newEntry], specificDateKey)
  }

  const deleteCalendarEntry = (specificDateKey: string, entryId: number): void => {
    const dayEntries = entries[specificDateKey] || []
    updateDayEntries(dayEntries.filter(e => e.id !== entryId), specificDateKey)
  }

  const executeMoveAndClose = async () => {
    if (!showOverlapConfirm) return
    const { entry, fromDateKey, toDateKey } = showOverlapConfirm
    try {
      await moveEntry(fromDateKey, toDateKey, entry)
      setEntries((prev) => ({
        ...prev,
        [fromDateKey]: (prev[fromDateKey] || []).filter((e) => e.id !== entry.id),
        [toDateKey]: [...(prev[toDateKey] || []), entry]
      }))
      setShowOverlapConfirm(null)
      setEditingEntry(null)
      setEditingEntryDateKey(null)
    } catch (error) {
      console.error('Failed to move entry after overlap confirmation:', error)
      notifyErrorToast('Move failed', 'Could not move the entry. Please try again.')
    }
  }

  const updateCalendarEntry = async (updatedEntry: TimeEntry, newDateKey?: string): Promise<{ shouldClose: boolean }> => {
    let fromDateKey: string | null = null
    for (const key in entries) {
      if (entries[key]?.some((e) => e.id === updatedEntry.id)) {
        fromDateKey = key
        break
      }
    }
    const targetDateKey = newDateKey ?? fromDateKey

    if (!fromDateKey || !targetDateKey) {
      console.warn('Entry not found in entries')
      return { shouldClose: true }
    }

    if (targetDateKey === fromDateKey) {
      const dayEntries = entries[fromDateKey] || []
      const index = dayEntries.findIndex((e) => e.id === updatedEntry.id)
      if (index !== -1) {
        const updated = [...dayEntries]
        updated[index] = updatedEntry
        updateDayEntries(updated, fromDateKey)
      }
      return { shouldClose: true }
    }

    const overlapping = await findOverlappingEntries(targetDateKey, updatedEntry)
    if (overlapping.length > 0) {
      setShowOverlapConfirm({ entry: updatedEntry, fromDateKey, toDateKey: targetDateKey })
      return { shouldClose: false }
    }

    try {
      await moveEntry(fromDateKey, targetDateKey, updatedEntry)
      setEntries((prev) => ({
        ...prev,
        [fromDateKey]: (prev[fromDateKey] || []).filter((e) => e.id !== updatedEntry.id),
        [targetDateKey]: [...(prev[targetDateKey] || []), updatedEntry]
      }))
      return { shouldClose: true }
    } catch (error) {
      console.error('Failed to move entry:', error)
      notifyErrorToast('Move failed', 'Could not move the entry. Please try again.')
      return { shouldClose: false }
    }
  }

  const changeDate = (days: number): void => {
    const newDate = new Date(currentDate)
    newDate.setDate(newDate.getDate() + days)
    setCurrentDate(newDate)
  }

  const addClient = () => {
    if (newClient.trim() && !clients.includes(newClient.trim())) {
      setClients([...clients, newClient.trim()])
      setNewClient('')
    }
  }

  const removeClient = (client: string): void => {
    setClients(clients.filter(c => c !== client))
  }

  const handleAddTodo = async () => {
    if (newTodoDescription.trim()) {
      const newTodo = await addTodo(
        newTodoDescription.trim(),
        newTodoClient.trim() || undefined,
        newTodoTicket.trim() || undefined,
        dateKey
      )
      if (newTodo) {
        console.log('Todo added:', newTodo)
        const filteredTodos = await getAllTodos(dateKey)
        setTodos(filteredTodos)
        setNewTodoDescription('')
        setNewTodoClient('')
        setNewTodoTicket('')
      }
    }
  }

  const handleToggleTodo = async (id: number): Promise<void> => {
    console.log('Toggling todo:', id)
    const success = await toggleTodoCompletion(id)
    console.log('Toggle result:', success)
    if (success) {
      const filteredTodos = await getAllTodos(dateKey)
      console.log('Refetched todos:', filteredTodos)
      setTodos(filteredTodos)
    }
  }

  const handleDeleteTodo = async (id: number): Promise<void> => {
    console.log('Deleting todo:', id)
    const success = await deleteTodo(id)
    console.log('Delete result:', success)
    if (success) {
      const filteredTodos = await getAllTodos(dateKey)
      setTodos(filteredTodos)
    }
  }

  const handleStartEditTodo = (todo: Todo): void => {
    setEditingTodoId(todo.id)
    setEditTodoDescription(todo.description)
    setEditTodoClient(todo.client || '')
    setEditTodoTicket(todo.ticket || '')
  }

  const handleSaveEditTodo = async () => {
    if (editingTodoId === null) return
    if (editTodoDescription.trim()) {
      const success = await updateTodo(
        editingTodoId,
        editTodoDescription.trim(),
        editTodoClient.trim() || undefined,
        editTodoTicket.trim() || undefined
      )
      if (success) {
        const filteredTodos = await getAllTodos(dateKey)
        setTodos(filteredTodos)
        setEditingTodoId(null)
        setEditTodoDescription('')
        setEditTodoClient('')
        setEditTodoTicket('')
      }
    }
  }

  const handleCancelEditTodo = () => {
    setEditingTodoId(null)
    setEditTodoDescription('')
    setEditTodoClient('')
    setEditTodoTicket('')
  }

  const getSortedTodos = () => {
    const uncompleted = todos.filter(t => !t.completed).sort((a, b) => b.id - a.id)
    const completed = todos.filter(t => t.completed).sort((a, b) => b.id - a.id)
    return [...uncompleted, ...completed]
  }

  const isTicketPinned = (client: string, ticket: string): boolean => {
    const lookup = toTicketKeyLookup(client, ticket)
    return pinnedTickets.some((pinned) => toTicketKeyLookup(pinned.client, pinned.ticket) === lookup)
  }

  const pinTicket = (client: string, ticket: string): void => {
    const trimmedClient = normalizeTicketPart(client)
    const trimmedTicket = normalizeTicketPart(ticket)
    if (!trimmedClient || !trimmedTicket) return

    const key = toTicketKey(trimmedClient, trimmedTicket)
    if (isTicketPinned(trimmedClient, trimmedTicket)) return

    setPinnedTickets((prev) => [
      ...prev,
      {
        key,
        client: trimmedClient,
        ticket: trimmedTicket,
        pinnedAt: dateKey
      }
    ])
  }

  const unpinTicket = (key: string): void => {
    if (friendlyNameTimersRef.current[key]) {
      clearTimeout(friendlyNameTimersRef.current[key])
      delete friendlyNameTimersRef.current[key]
    }
    setFriendlyNameDrafts((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    setPinnedTickets((prev) => prev.filter((ticket) => ticket.key !== key))
  }

  const updatePinnedFriendlyName = (key: string, friendlyName: string): void => {
    setPinnedTickets((prev) => prev.map((ticket) => (
      ticket.key === key
        ? { ...ticket, friendlyName }
        : ticket
    )))
  }

  const handlePinnedFriendlyNameChange = (key: string, value: string): void => {
    setFriendlyNameDrafts((prev) => ({ ...prev, [key]: value }))
    if (friendlyNameTimersRef.current[key]) {
      clearTimeout(friendlyNameTimersRef.current[key])
    }
    friendlyNameTimersRef.current[key] = setTimeout(() => {
      updatePinnedFriendlyName(key, value)
      delete friendlyNameTimersRef.current[key]
    }, 300)
  }

  const getRecentTicketStats = (): Record<string, TicketRecentStats> => {
    const recentDateKeys = getRecentDateKeys(currentDate)
    const stats: Record<string, TicketRecentStats> = {}

    recentDateKeys.forEach((recentDateKey) => {
      const dayEntries = entries[recentDateKey] || []
      dayEntries.forEach((entry) => {
        const client = normalizeTicketPart(entry.client)
        const ticket = normalizeTicketPart(entry.ticket)
        if (!client || !ticket) return
        const lookup = toTicketKeyLookup(client, ticket)
        const currentLastLogged = stats[lookup]?.lastLoggedDate
        if (!currentLastLogged || recentDateKey > currentLastLogged) {
          stats[lookup] = { client, ticket, lastLoggedDate: recentDateKey }
        }
      })
    })

    return stats
  }

  const recentTicketStats = getRecentTicketStats()

  const getTicketOptionGroups = (): TicketOptionGroups => {
    const groups: TicketOptionGroups = { pinned: [], todos: [], recent: [] }
    const seenGlobal = new Set<string>()

    pinnedTickets.forEach((pinned) => {
      const lookup = toTicketKeyLookup(pinned.client, pinned.ticket)
      if (seenGlobal.has(lookup)) return

      const lastLoggedDate = recentTicketStats[lookup]?.lastLoggedDate
      groups.pinned.push({
        key: pinned.key,
        client: pinned.client,
        ticket: pinned.ticket,
        source: 'pinned',
        friendlyName: pinned.friendlyName,
        lastLoggedDate,
        sortByRecentDate: lastLoggedDate
      })
      seenGlobal.add(lookup)
    })

    const todosSeen = new Set<string>()
    todos
      .filter((todo) => !todo.completed || todo.completedDate === dateKey)
      .filter((todo) => Boolean(todo.client && todo.ticket))
      .forEach((todo) => {
        const client = normalizeTicketPart(todo.client || '')
        const ticket = normalizeTicketPart(todo.ticket || '')
        if (!client || !ticket) return

        const lookup = toTicketKeyLookup(client, ticket)
        if (todosSeen.has(lookup) || seenGlobal.has(lookup)) return

        const pinnedMatch = pinnedTickets.find((pinned) => toTicketKeyLookup(pinned.client, pinned.ticket) === lookup)
        const lastLoggedDate = recentTicketStats[lookup]?.lastLoggedDate
        groups.todos.push({
          key: toTicketKey(client, ticket),
          client,
          ticket,
          source: 'todo',
          friendlyName: pinnedMatch?.friendlyName,
          lastLoggedDate,
          sortByRecentDate: lastLoggedDate
        })
        todosSeen.add(lookup)
        seenGlobal.add(lookup)
      })

    const recentSeen = new Set<string>()
    Object.entries(recentTicketStats).forEach(([lookup, stats]) => {
      if (recentSeen.has(lookup) || seenGlobal.has(lookup)) return
      const client = stats.client
      const ticket = stats.ticket
      if (!client || !ticket) return

      const pinnedMatch = pinnedTickets.find((pinned) => toTicketKeyLookup(pinned.client, pinned.ticket) === lookup)
      groups.recent.push({
        key: toTicketKey(client, ticket),
        client,
        ticket,
        source: 'recent',
        friendlyName: pinnedMatch?.friendlyName,
        lastLoggedDate: stats.lastLoggedDate,
        sortByRecentDate: stats.lastLoggedDate
      })
      recentSeen.add(lookup)
      seenGlobal.add(lookup)
    })

    groups.pinned.sort(sortTicketOptions)
    groups.todos.sort(sortTicketOptions)
    groups.recent.sort(sortTicketOptions)
    groups.recent = groups.recent.slice(0, 30)

    return groups
  }

  const ticketOptionGroups = getTicketOptionGroups()

  const pinnedTicketsForDisplay = [...pinnedTickets]
    .map((ticket) => {
      const lookup = toTicketKeyLookup(ticket.client, ticket.ticket)
      return {
        ...ticket,
        lastLoggedDate: recentTicketStats[lookup]?.lastLoggedDate
      }
    })
    .sort((a, b) => {
      const dateA = a.lastLoggedDate || ''
      const dateB = b.lastLoggedDate || ''
      if (dateA !== dateB) {
        return dateB.localeCompare(dateA)
      }
      return a.key.localeCompare(b.key)
    })

  const getJiraUrl = (client?: string, ticket?: string): string | undefined => {
    if (jiraBaseUrl && client && ticket) {
      return `${jiraBaseUrl}/${client}-${ticket}`
    }
    return undefined
  }

  const getSummary = () => {
    const dayEntries = entries[dateKey] || []
    const summary: Record<string, SummaryAccumulator> = {}

    dayEntries.forEach(entry => {
      if (entry.client && entry.startTime && entry.endTime) {
        const ticketTrim = entry.ticket ? entry.ticket.trim() : ''
        const key = ticketTrim ? `${entry.client}-${ticketTrim}` : `${entry.client}-untracked-${entry.id}`
        const isUntracked = !ticketTrim

        const [startH, startM] = entry.startTime.split(':').map(Number)
        const [endH, endM] = entry.endTime.split(':').map(Number)
        const start = startH * 60 + startM
        const end = endH * 60 + endM
        const minutes = end - start

        if (!summary[key]) {
          summary[key] = {
            client: entry.client,
            ticket: ticketTrim,
            minutes: 0,
            descriptions: [],
            allDisabled: true,
            someDisabled: false,
            entryIds: [],
            isUntracked
          }
        }
        summary[key].minutes += minutes
        summary[key].entryIds.push(entry.id)
        if (!entry.disabled) {
          summary[key].allDisabled = false
        } else {
          summary[key].someDisabled = true
        }
        if (entry.description && entry.description.trim()) {
          summary[key].descriptions.push(entry.description.trim())
        }
      }
    })

    const summaryArray = Object.entries(summary).map(([key, data]) => ({
      key,
      ...data,
      hours: (data.minutes / 60).toFixed(2),
      isIndeterminate: data.someDisabled && !data.allDisabled
    }))

    return summaryArray.sort((a, b) => {
      if (a.allDisabled === b.allDisabled) return 0
      return a.allDisabled ? 1 : -1
    })
  }

  const getSummaryTotalHours = () => {
    const summary = getSummary()
    const totalMinutes = summary.reduce((acc, item) => acc + item.minutes, 0)
    return (totalMinutes / 60).toFixed(2)
  }

  const getClientTotals = () => {
    const dayEntries = entries[dateKey] || []
    const clientTotals: Record<string, number> = {}

    dayEntries.forEach(entry => {
      if (entry.client && entry.startTime && entry.endTime) {
        const [startH, startM] = entry.startTime.split(':').map(Number)
        const [endH, endM] = entry.endTime.split(':').map(Number)
        const start = startH * 60 + startM
        const end = endH * 60 + endM
        const minutes = end - start

        if (!clientTotals[entry.client]) {
          clientTotals[entry.client] = 0
        }
        clientTotals[entry.client] += minutes
      }
    })

    return clientTotals
  }

  const isEntryUntracked = (entry: TimeEntry): boolean => !entry.ticket || !entry.ticket.trim()

  const toggleSummaryEntries = (entryIds: number[], disabled: boolean): void => {
    const dayEntries = entries[dateKey] || []
    const trackedIds = disabled
      ? entryIds.filter(id => {
        const entry = dayEntries.find(e => e.id === id)
        return entry && !isEntryUntracked(entry)
      })
      : entryIds
    const updatedEntries = dayEntries.map(entry => {
      if (trackedIds.includes(entry.id)) {
        return { ...entry, disabled }
      }
      return entry
    })
    updateDayEntries(updatedEntries)
  }

  const handleMarkAsLogged = () => {
    if (clickedSummary) {
      toggleSummaryEntries(clickedSummary.entryIds, true)
      setClickedSummary(null)
    }
    setShowLogPrompt(false)
  }

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const handleCalendarClick = () => {
    const datePicker = document.getElementById('date-picker')
    if (datePicker instanceof HTMLInputElement && typeof datePicker.showPicker === 'function') {
      try {
        datePicker.showPicker()
      } catch {
        // Ignore unsupported or user-gesture restricted picker invocation failures.
      }
    }
  }

  const toggleSection = (sectionName: string): void => {
    setCollapsedSections(prev => ({
      ...prev,
      [sectionName]: !prev[sectionName]
    }))
  }

  const evaluateRemindersNow = (referenceNow: Date): void => {
    if (activeReminderRef.current) return

    const openDue = isReminderDue(openReminderTimeRef.current, lastOpenReminderDateRef.current, referenceNow)
    const closeDue = isReminderDue(closeReminderTimeRef.current, lastCloseReminderDateRef.current, referenceNow)
    const todayKey = formatLocalDate(referenceNow)

    if (openDue) {
      lastOpenReminderDateRef.current = todayKey
      setLastOpenReminderDate(todayKey)
      activeReminderRef.current = 'open'
      setActiveReminder('open')
      return
    }

    if (closeDue) {
      lastCloseReminderDateRef.current = todayKey
      setLastCloseReminderDate(todayKey)
      activeReminderRef.current = 'close'
      setActiveReminder('close')
    }
  }

  const handleDismissReminder = () => {
    activeReminderRef.current = null
    setActiveReminder(null)
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'q') {
        e.preventDefault();
        setIsSearchOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [])

  useEffect(() => {
    const header = headerRef.current
    if (!header) return

    const updateHeight = () => {
      const headerH = header.offsetHeight
      const headerMarginBottom = 20
      setHeaderHeight(headerH + headerMarginBottom)
    }

    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(header)
    return () => observer.disconnect()
  }, [currentView])

  return (
    <>
      <div className="app">
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        currentDate={currentDate}
        currentView={currentView}
        onNavigateToDate={(date) => {
          const parsedDate = dateKeyToLocalNoon(date)
          if (parsedDate) {
            setCurrentDate(parsedDate)
          } else {
            notifyErrorToast('Invalid date', 'Could not navigate to the selected date.')
          }
        }}
      />
      {activeReminder && (
        <div className="reminder-modal-overlay" onClick={handleDismissReminder}>
          <div className="reminder-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Reminder</h3>
            <p>Reminder: send {activeReminder} email</p>
            <div className="confirmation-buttons">
              <button className="btn-confirm" onClick={handleDismissReminder}>Dismiss</button>
            </div>
          </div>
        </div>
      )}
        <div className="main-content">
          <button
            className="sidebar-toggle-button"
            onClick={() => setSidebarVisible(!sidebarVisible)}
            title={sidebarVisible ? 'Hide Sidebar' : 'Show Sidebar'}
          >
            {sidebarVisible ? '›' : '‹'}
          </button>
          <div className="header" ref={headerRef}>
            <h1>Time Tracker</h1>
            <div className="view-toggle">
              <button
                className={`view-button ${currentView === 'calendar' ? 'active' : ''}`}
                onClick={() => setCurrentView('calendar')}
              >
                Calendar
              </button>
              <button
                className={`view-button ${currentView === 'task' ? 'active' : ''}`}
                onClick={() => setCurrentView('task')}
              >
                Daily Tasks
              </button>
            </div>
            <div className="date-navigation">
              <button onClick={() => changeDate(-1)}>← Previous</button>
              <span>{formatDate(currentDate)}</span>
              <button onClick={() => changeDate(1)}>Next →</button>
              <button onClick={() => setCurrentDate(toLocalNoon(new Date()))}>Today</button>
              <div className="date-picker-wrapper">
                <span className="calendar-icon" onClick={handleCalendarClick}>📅</span>
                <input
                  id="date-picker"
                  type="date"
                  value={formatLocalDate(currentDate)}
                  onChange={(e) => {
                    const parsedDate = dateKeyToLocalNoon(e.target.value)
                    if (parsedDate) {
                      setCurrentDate(parsedDate)
                    } else {
                      notifyErrorToast('Invalid date', 'Please select a valid date.')
                    }
                  }}
                  className="date-picker-input"
                />
              </div>
              <button
                className="search-button"
                onClick={() => setIsSearchOpen(true)}
                title="Search entries (Ctrl/Cmd+Q)"
              >
                🔍
              </button>
            </div>
          </div>

          <Suspense fallback={<div className="total-hours">Loading view...</div>}>
            {currentView === 'task' ? (
              <TaskView
                dayEntries={entries[dateKey] || []}
                clients={clients}
                defaultStartTime={defaultStartTime}
                onUpdateDayEntries={(newEntries) => updateDayEntries(newEntries)}
                getJiraUrl={getJiraUrl}
                isEntryUntracked={isEntryUntracked}
              />
            ) : (
              <CalendarView
                style={{ height: `calc(100% - ${headerHeight}px)` }}
                entries={entries}
                now={now}
                currentDate={currentDate}
                onAddEntry={addCalendarEntry}
                onUpdateEntry={updateCalendarEntry}
                onDeleteEntry={deleteCalendarEntry}
                clients={clients}
                clientColors={clientColors}
                defaultStartTime={defaultStartTime}
                intervalMinutes={calendarInterval}
                calendarStartTime={calendarStartTime}
                calendarEndTime={calendarEndTime}
                onEditEntry={(entry, dateKey) => {
                  setEditingEntry(entry)
                  setEditingEntryDateKey(dateKey ?? null)
                }}
                editingEntry={editingEntry}
                editingEntryDateKey={editingEntryDateKey}
                ticketOptions={ticketOptionGroups}
                isEntryUntracked={isEntryUntracked}
              />
            )}
          </Suspense>
        </div>

        {sidebarVisible && (
          <div className="sidebar-container">
            <div className="sidebar">
              <CollapsibleSection
                title={`Ticket Summaries (Total: ${getSummaryTotalHours()}h)`}
                sectionName="summary"
                isCollapsed={collapsedSections.summary}
                onToggle={() => toggleSection('summary')}
              >
                {getSummary().length > 0 ? (
                  <ul className="client-list">
                    {getSummary().map(item => (
                      <li
                        key={item.key}
                        className="client-item"
                        style={{ flexDirection: 'column', alignItems: 'flex-start', position: 'relative', paddingBottom: '35px', opacity: item.allDisabled ? 0.5 : 1 }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                          <div>
                            {getJiraUrl(item.client, item.ticket) ? (
                              <a
                                href={getJiraUrl(item.client, item.ticket)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="summary-link"
                                onClick={(e) => {
                                  navigator.clipboard.writeText(item.hours + 'h')
                                  setClickedSummary(item)
                                }}
                              >
                                {item.isUntracked ? `${item.client} (untracked)` : item.key}
                              </a>
                            ) : (
                              <span className="summary-link">
                                {item.isUntracked ? `${item.client} (untracked)` : item.key}
                              </span>
                            )}
                          </div>
                          <div className="summary-actions">
                            <div className="summary-hours">
                              {item.hours}h
                            </div>
                            {!item.isUntracked && !isTicketPinned(item.client, item.ticket) && (
                              <button
                                className="summary-pin-button"
                                onClick={() => pinTicket(item.client, item.ticket)}
                                title="Pin ticket"
                              >
                                Pin
                              </button>
                            )}
                          </div>
                        </div>
                        {item.descriptions.length > 0 && (
                          <ul style={{ marginTop: '8px', paddingLeft: '20px', width: '100%' }}>
                            {item.descriptions.flatMap((desc) =>
                              desc.split(/[;\n]/).map((part) => part.trim()).filter(part => part.length > 0)
                            ).map((desc, idx) => (
                              <li key={idx} className="summary-description">
                                {desc}
                              </li>
                            ))}
                          </ul>
                        )}
                        {!item.isUntracked && (
                          <div style={{ position: 'absolute', bottom: '10px', right: '10px' }}>
                            <input
                              type="checkbox"
                              checked={item.allDisabled}
                              ref={(el) => {
                                if (el) el.indeterminate = item.isIndeterminate
                              }}
                              onChange={(e) => toggleSummaryEntries(item.entryIds, e.target.checked)}
                              style={{
                                marginBottom: '0',
                              }}
                              title="Toggle all entries for this ticket"
                            />
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ color: '#999', fontSize: '14px', padding: '10px' }}>
                    No entries with client yet
                  </div>
                )}
              </CollapsibleSection>

              <CollapsibleSection
                title="Pinned Tickets"
                sectionName="pinnedTickets"
                isCollapsed={collapsedSections.pinnedTickets}
                onToggle={() => toggleSection('pinnedTickets')}
              >
                {pinnedTicketsForDisplay.length > 0 ? (
                  <ul className="client-list">
                    {pinnedTicketsForDisplay.map((ticket) => (
                      <li key={ticket.key} className="client-item pinned-ticket-item">
                        <div className="pinned-ticket-header">
                          <span className="pinned-ticket-label">
                            {ticket.friendlyName?.trim() ? `${ticket.friendlyName.trim()} (${ticket.key})` : ticket.key}
                          </span>
                          <button onClick={() => unpinTicket(ticket.key)}>Unpin</button>
                        </div>
                        <div className="pinned-ticket-recent">
                          Last logged: {ticket.lastLoggedDate || '> 7 days ago'}
                        </div>
                        <input
                          type="text"
                          placeholder="Friendly name (optional)"
                          value={friendlyNameDrafts[ticket.key] ?? ticket.friendlyName ?? ''}
                          onChange={(e) => handlePinnedFriendlyNameChange(ticket.key, e.target.value)}
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ color: '#999', fontSize: '14px', padding: '10px' }}>
                    No pinned tickets yet
                  </div>
                )}
              </CollapsibleSection>

              <CollapsibleSection
                title="Todo"
                sectionName="todo"
                isCollapsed={collapsedSections.todo}
                onToggle={() => toggleSection('todo')}
              >
                <div className="todo-form" style={{ marginBottom: '15px' }}>
                  <TodoFormFields
                    description={newTodoDescription}
                    descriptionRef={newTodoDescriptionRef}
                    onDescriptionChange={setNewTodoDescription}
                    onDescriptionInput={autoResizeTextarea}
                    clientValue={newTodoClient}
                    onClientChange={setNewTodoClient}
                    clients={clients}
                    ticketValue={newTodoTicket}
                    onTicketChange={setNewTodoTicket}
                  />
                  <button className="add-button" onClick={handleAddTodo}>
                    Add Todo
                  </button>
                </div>

                {getSortedTodos().length > 0 ? (
                  <ul className="client-list">
                    {getSortedTodos().map(todo => (
                      <li
                        key={todo.id}
                        className={`client-item todo-item ${todo.completed ? 'todo-completed' : ''}`}
                      >
                        {editingTodoId === todo.id ? (
                          <>
                            <div>
                              <TodoFormFields
                                description={editTodoDescription}
                                descriptionRef={editTodoDescriptionRef}
                                onDescriptionChange={setEditTodoDescription}
                                onDescriptionInput={autoResizeTextarea}
                                clientValue={editTodoClient}
                                onClientChange={setEditTodoClient}
                                clients={clients}
                                ticketValue={editTodoTicket}
                                onTicketChange={setEditTodoTicket}
                                descriptionStyle={{ width: '100%', marginBottom: '8px' }}
                              />
                            </div>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', width: '100%' }}>
                              <button onClick={handleCancelEditTodo} style={{ padding: '4px 8px', fontSize: '12px', marginLeft: 'auto' }}>
                                Cancel
                              </button>
                              <button onClick={handleSaveEditTodo} style={{ padding: '4px 8px', fontSize: '12px' }}>
                                Save
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="todo-card-top">
                              <Checkbox.Root
                                className="todo-checkbox"
                                checked={todo.completed}
                                onCheckedChange={() => handleToggleTodo(todo.id)}
                                  aria-label={todo.completed ? 'Mark todo as incomplete' : 'Mark todo as complete'}
                                >
                                  <Checkbox.Indicator className="todo-checkbox-indicator">
                                    <svg viewBox="0 0 16 16" aria-hidden="true">
                                      <path d="M3.5 8.2 6.6 11 12.5 4.8" />
                                    </svg>
                                  </Checkbox.Indicator>
                                </Checkbox.Root>
                              <div className="todo-card-spacer" />
                              {todo.client && (
                                <div className="todo-ticket">
                                  {todo.ticket ? (
                                    getJiraUrl(todo.client, todo.ticket) ? (
                                      <a
                                        href={getJiraUrl(todo.client, todo.ticket)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="summary-link"
                                        style={{ fontSize: 'inherit' }}
                                      >
                                        {todo.client}-{todo.ticket}
                                      </a>
                                    ) : (
                                      <span>{todo.client}-{todo.ticket}</span>
                                    )
                                  ) : (
                                    <span>{todo.client}</span>
                                  )}
                                </div>
                              )}
                              <button
                                className="todo-delete-button"
                                onClick={() => handleDeleteTodo(todo.id)}
                                aria-label="Delete todo"
                                title="Delete todo"
                              >
                                <svg viewBox="0 0 20 20" aria-hidden="true">
                                  <path d="M4 4 L16 16 M16 4 L4 16" />
                                </svg>
                              </button>
                            </div>
                            <div
                              className="todo-description-wrap"
                              onClick={() => handleStartEditTodo(todo)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                                  e.preventDefault()
                                  handleStartEditTodo(todo)
                                }
                              }}
                              tabIndex={0}
                              role="button"
                              aria-label="Edit todo description"
                              title="Click to edit"
                            >
                              <pre className={`todo-description-pre ${todo.completed ? 'todo-description-complete' : ''}`}>
                                {todo.description}
                              </pre>
                            </div>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ color: '#999', fontSize: '14px', padding: '10px' }}>
                    No todos yet
                  </div>
                )}
              </CollapsibleSection>

              <CollapsibleSection
                title="Client Summaries"
                sectionName="clients"
                isCollapsed={collapsedSections.clients}
                onToggle={() => toggleSection('clients')}
              >
                <input
                  type="text"
                  placeholder="New client name"
                  value={newClient}
                  onChange={(e) => setNewClient(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addClient()}
                />
                <button className="add-button" onClick={addClient}>
                  Add Client
                </button>
                <ul className="client-list">
                  {[...clients]
                    .sort((a, b) => {
                      const clientTotals = getClientTotals()
                      const aTotals = clientTotals[a] || 0
                      const bTotals = clientTotals[b] || 0
                      // Clients with time first
                      if (aTotals > 0 && bTotals === 0) return -1
                      if (aTotals === 0 && bTotals > 0) return 1
                      // Then alphabetically
                      return a.localeCompare(b)
                    })
                    .map(client => {
                      const clientTotals = getClientTotals()
                      const totalHours = clientTotals[client] ? (clientTotals[client] / 60).toFixed(2) : '0.00'
                      return (
                        <li key={client} className="client-item client-item-with-color">
                          <div className="client-info">
                            <span>
                              {client}
                              {clientTotals[client] && clientTotals[client] > 0 && (
                                <span style={{ color: '#999', fontSize: '12px', marginLeft: '8px' }}>
                                  ({totalHours}h)
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="client-color-picker">
                            <input
                              type="color"
                              value={clientColors[client] || '#2196F3'}
                              onChange={(e) => setClientColors({ ...clientColors, [client]: e.target.value })}
                              style={{
                                marginBottom: '0',
                              }}
                              title="Set client color"
                            />
                            <div
                              className="color-preview"
                              style={{
                                backgroundColor: clientColors[client] || '#2196F3',
                                color: getContrastColor(clientColors[client] || '#2196F3')
                              }}
                            >
                              Aa
                            </div>
                          </div>
                          <button onClick={() => removeClient(client)}>Remove</button>
                        </li>
                      )
                    })}
                </ul>
              </CollapsibleSection>

              <CollapsibleSection
                title="Settings"
                sectionName="settings"
                isCollapsed={collapsedSections.settings}
                onToggle={() => toggleSection('settings')}
              >
                <div style={{ marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '14px', marginBottom: '8px', fontWeight: '600' }}>Jira Base URL</h3>
                  <input
                    type="text"
                    placeholder="e.g., https://jira.example.com/browse"
                    value={jiraBaseUrl}
                    onChange={(e) => setJiraBaseUrl(e.target.value)}
                  />
                  <div style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
                    Tickets will link to: {jiraBaseUrl || '(not set)'}/CLIENT-123
                  </div>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '14px', marginBottom: '8px', fontWeight: '600' }}>Default Start Time</h3>
                  <input
                    type="time"
                    value={defaultStartTime}
                    onChange={(e) => setDefaultStartTime(e.target.value)}
                  />
                  <div style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
                    New entries will start at {defaultStartTime} (if no previous entries)
                  </div>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '14px', marginBottom: '8px', fontWeight: '600' }}>Open Reminder Time</h3>
                  <Input
                    type="time"
                    value={openReminderTime ?? ''}
                    onChange={(e) => {
                      const nextValue = e.target.value || null
                      if (nextValue === openReminderTime) return
                      openReminderTimeRef.current = nextValue
                      lastOpenReminderDateRef.current = null
                      setOpenReminderTime(nextValue)
                      setLastOpenReminderDate(null)
                      evaluateRemindersNow(new Date())
                    }}
                  />
                  <div style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
                    Shows a daily reminder to send your open email.
                  </div>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '14px', marginBottom: '8px', fontWeight: '600' }}>Close Reminder Time</h3>
                  <input
                    type="time"
                    value={closeReminderTime ?? ''}
                    onChange={(e) => {
                      const nextValue = e.target.value || null
                      if (nextValue === closeReminderTime) return
                      closeReminderTimeRef.current = nextValue
                      lastCloseReminderDateRef.current = null
                      setCloseReminderTime(nextValue)
                      setLastCloseReminderDate(null)
                      evaluateRemindersNow(new Date())
                    }}
                  />
                  <div style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
                    Shows a daily reminder to send your close email.
                  </div>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '14px', marginBottom: '8px', fontWeight: '600' }}>Calendar Interval</h3>
                  <select
                    value={calendarInterval}
                    onChange={(e) => setCalendarInterval(Number(e.target.value))}
                    style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ddd' }}
                  >
                    <option value="5">5 minutes</option>
                    <option value="15">15 minutes</option>
                    <option value="30">30 minutes</option>
                    <option value="60">60 minutes</option>
                  </select>
                  <div style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
                    Drag precision for calendar view
                  </div>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '14px', marginBottom: '8px', fontWeight: '600' }}>Calendar Start Time</h3>
                  <input
                    type="time"
                    value={calendarStartTime}
                    onChange={(e) => setCalendarStartTime(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ddd' }}
                  />
                  <div style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
                    Earliest time to display in calendar
                  </div>
                </div>

                <div>
                  <h3 style={{ fontSize: '14px', marginBottom: '8px', fontWeight: '600' }}>Calendar End Time</h3>
                  <input
                    type="time"
                    value={calendarEndTime}
                    onChange={(e) => setCalendarEndTime(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ddd' }}
                  />
                  <div style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
                    Latest time to display in calendar
                  </div>
                </div>
              </CollapsibleSection>

              <div className="sidebar-section dark-mode-section">
                <button
                  className="dark-mode-toggle"
                  onClick={() => setDarkMode(!darkMode)}
                  title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                >
                  {darkMode ? '☀️ Light Mode' : '🌙 Dark Mode'}
                </button>
              </div>
            </div>
          </div>
        )}

        {showLogPrompt && clickedSummary && (
          <div className="calendar-modal-overlay" onClick={() => setShowLogPrompt(false)}>
            <div className="calendar-modal" style={{ maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
              <h3>Mark as Logged?</h3>
              <p>Would you like to mark <strong>{clickedSummary.key}</strong> as logged?</p>
              <div className="modal-buttons">
                <button className="btn-cancel" onClick={() => { setShowLogPrompt(false); setClickedSummary(null); }}>No</button>
                <button className="btn-save" onClick={handleMarkAsLogged}>Yes, Mark as Logged</button>
              </div>
            </div>
          </div>
        )}

        {showOverlapConfirm && (
          <div className="calendar-modal-overlay" onClick={() => setShowOverlapConfirm(null)}>
            <div className="calendar-modal" style={{ maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
              <h3>Time Overlap Warning</h3>
              <p>Moving this entry will create overlapping time with existing entries on {showOverlapConfirm.toDateKey}. Continue?</p>
              <div className="modal-buttons">
                <button className="btn-cancel" onClick={() => setShowOverlapConfirm(null)}>Cancel</button>
                <button className="btn-save" onClick={executeMoveAndClose}>Continue</button>
              </div>
            </div>
          </div>
        )}
      </div>
      <Toaster />
    </>
  )
}

export default App
