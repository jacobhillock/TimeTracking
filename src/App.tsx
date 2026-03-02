import { lazy, Suspense, useState, useEffect, useRef } from 'react'
import { migrateFromLocalStorage } from './services/db'
import { getEntriesForDay, getEntriesForDays, setEntriesForDay, moveEntry, findOverlappingEntries } from './services/timeEntryService'
import { getAllTodos, addTodo, toggleTodoCompletion, deleteTodo, updateTodo } from './services/todoService'
import type { TimeEntry, Todo } from './services/types'
import type { ClientColors, CollapsedSections, EditableTimeEntry, EntriesByDate, ViewMode } from './types/app'
import useLocalStorageState, { STORAGE_KEYS } from './hooks/useLocalStorageState'
import SearchModal from './SearchModal'
import CollapsibleSection from './components/CollapsibleSection'

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

function App() {
  const [currentDate, setCurrentDate] = useState(new Date())
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
  const [calendarEndTime, setCalendarEndTime] = useLocalStorageState<string>(STORAGE_KEYS.CALENDAR_END_TIME, '24:00')
  const [editingEntry, setEditingEntry] = useState<EditableTimeEntry | null>(null)
  const [editingEntryDateKey, setEditingEntryDateKey] = useState<string | null>(null)
  const [showOverlapConfirm, setShowOverlapConfirm] = useState<OverlapConfirmState | null>(null)
  const [darkMode, setDarkMode] = useLocalStorageState<boolean>(STORAGE_KEYS.DARK_MODE, false)
  const [sidebarVisible, setSidebarVisible] = useLocalStorageState<boolean>(STORAGE_KEYS.SIDEBAR_VISIBLE, true)
  const [collapsedSections, setCollapsedSections] = useLocalStorageState<CollapsedSections>(STORAGE_KEYS.COLLAPSED_SECTIONS, {})
  const [newClient, setNewClient] = useState('')
  const [isSearchOpen, setIsSearchOpen] = useState(false)
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
  const headerRef = useRef<HTMLDivElement | null>(null)
  const [headerHeight, setHeaderHeight] = useState(0)
  const windowWasBlurred = useRef<boolean>(false)

  const dateKey = currentDate.toISOString().split('T')[0]

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
        setIsLoadingEntries(false)
        console.log('Database initialized and migration complete')
      } catch (error) {
        console.error('Failed to initialize database:', error)
        const saved = localStorage.getItem('timeEntries')
        if (saved) {
          setEntries(JSON.parse(saved))
        }
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
          weekDates.push(date.toISOString().split('T')[0])
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
    const loadTodos = async () => {
      const filteredTodos = await getAllTodos(dateKey)
      setTodos(filteredTodos)
    }
    loadTodos()
  }, [dateKey])

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
    await moveEntry(fromDateKey, toDateKey, entry)
    const fromEntries = (entries[fromDateKey] || []).filter((e) => e.id !== entry.id)
    const toEntries = entries[toDateKey] || []
    setEntries((prev) => ({
      ...prev,
      [fromDateKey]: fromEntries,
      [toDateKey]: [...toEntries, entry]
    }))
    setShowOverlapConfirm(null)
    setEditingEntry(null)
    setEditingEntryDateKey(null)
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

    await moveEntry(fromDateKey, targetDateKey, updatedEntry)
    const fromEntries = (entries[fromDateKey] || []).filter((e) => e.id !== updatedEntry.id)
    const toEntries = entries[targetDateKey] || []
    setEntries((prev) => ({
      ...prev,
      [fromDateKey]: fromEntries,
      [targetDateKey]: [...toEntries, updatedEntry]
    }))
    return { shouldClose: true }
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
    if (datePicker instanceof HTMLInputElement) {
      datePicker.showPicker()
    }
  }

  const toggleSection = (sectionName: string): void => {
    setCollapsedSections(prev => ({
      ...prev,
      [sectionName]: !prev[sectionName]
    }))
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
    <div className="app">
      <SearchModal 
        isOpen={isSearchOpen} 
        onClose={() => setIsSearchOpen(false)}
        currentDate={currentDate}
        currentView={currentView}
        onNavigateToDate={(date) => {
          setCurrentDate(new Date(date + 'T12:00:00'))
        }}
      />
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
            <button onClick={() => setCurrentDate(new Date())}>Today</button>
            <div className="date-picker-wrapper">
              <span className="calendar-icon" onClick={handleCalendarClick}>📅</span>
              <input
                id="date-picker"
                type="date"
                value={currentDate.toISOString().split('T')[0]}
                onChange={(e) => setCurrentDate(new Date(e.target.value + 'T12:00:00'))}
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
                    <div className="summary-hours">
                      {item.hours}h
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
          title="Todo" 
          sectionName="todo"
          isCollapsed={collapsedSections.todo}
          onToggle={() => toggleSection('todo')}
        >
          <div className="todo-form" style={{ marginBottom: '15px' }}>
            <input
              type="text"
              placeholder="Todo description"
              value={newTodoDescription}
              onChange={(e) => setNewTodoDescription(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddTodo()}
              style={{ marginBottom: '8px' }}
            />
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <select
                value={newTodoClient}
                onChange={(e) => setNewTodoClient(e.target.value)}
                className="todo-form-field"
                style={{ flex: 1 }}
              >
                <option value="">Optional client</option>
                {clients.map(client => (
                  <option key={client} value={client}>{client}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Ticket #"
                value={newTodoTicket}
                onChange={(e) => setNewTodoTicket(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddTodo()}
                className="todo-form-field"
                style={{ flex: 1 }}
              />
            </div>
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
                  style={{ 
                    display: 'flex',
                    flexFlow: 'column',
                    gap: '8px',
                    opacity: todo.completed ? 0.5 : 1,
                    position: 'relative'
                  }}
                >
                  {editingTodoId === todo.id ? (
                    <>
                      <div>
                        <input
                          type="text"
                          value={editTodoDescription}
                          onChange={(e) => setEditTodoDescription(e.target.value)}
                          style={{ width: '100%', marginBottom: '8px' }}
                          placeholder="Todo description"
                        />
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                          <select
                            value={editTodoClient}
                            onChange={(e) => setEditTodoClient(e.target.value)}
                            className="todo-form-field"
                            style={{ flex: 1 }}
                          >
                            <option value="">Optional client</option>
                            {clients.map(client => (
                              <option key={client} value={client}>{client}</option>
                            ))}
                          </select>
                          <input
                            type="text"
                            placeholder="Ticket #"
                            value={editTodoTicket}
                            onChange={(e) => setEditTodoTicket(e.target.value)}
                            className="todo-form-field"
                            style={{ flex: 1 }}
                          />
                        </div>
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
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <input
                            type="checkbox"
                            checked={todo.completed}
                            onChange={() => handleToggleTodo(todo.id)}
                            style={{ 
                              margin: '0',
                              flexShrink: 0
                            }}
                          />
                        </div>
                        {todo.client && (
                          <div style={{ fontSize: '12px', marginLeft: '10px' }}>
                            {todo.ticket ? (
                              getJiraUrl(todo.client, todo.ticket) ? (
                                <a 
                                  href={getJiraUrl(todo.client, todo.ticket)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="summary-link"
                                  style={{ fontSize: '12px' }}
                                >
                                  {todo.client}-{todo.ticket}
                                </a>
                              ) : (
                                <span style={{ color: '#666' }}>{todo.client}-{todo.ticket}</span>
                              )
                            ) : (
                              <span style={{ color: '#666' }}>{todo.client}</span>
                            )}
                          </div>
                        )}
                      </div>
                      <div 
                        style={{ 
                          textDecoration: todo.completed ? 'line-through' : 'none',
                          paddingRight: '10px',
                          wordWrap: 'break-word',
                          cursor: 'pointer'
                        }}
                        onClick={() => handleStartEditTodo(todo)}
                        title="Click to edit"
                      >
                        {todo.description}
                      </div>
                      <div style={{ position: 'absolute', bottom: '10px', right: '10px', display: 'flex', gap: '8px' }}>
                        <button 
                          onClick={() => handleDeleteTodo(todo.id)}
                          style={{ 
                            padding: '4px 8px', 
                            fontSize: '12px'
                          }}
                        >
                          Delete
                        </button>
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
            {clients
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
            <h3 style={{ fontSize: '14px', marginBottom: '8px', fontWeight: '600' }}>Calendar Interval</h3>
            <select
              value={calendarInterval}
              defaultValue="15"
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
  )
}

export default App
