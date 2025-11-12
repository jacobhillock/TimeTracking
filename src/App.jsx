import { useState, useEffect, useRef } from 'react'

function Chevron({ isCollapsed }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" style={{ transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)', transition: 'transform 0.2s' }}>
      <path d="M4 2L8 6L4 10" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function CollapsibleSection({ title, sectionName, isCollapsed, onToggle, children }) {
  const contentRef = useRef(null)
  const [maxHeight, setMaxHeight] = useState('none')

  useEffect(() => {
    if (contentRef.current) {
      setMaxHeight(isCollapsed ? '0px' : `${contentRef.current.scrollHeight}px`)
    }
  }, [isCollapsed, children])

  return (
    <div className="sidebar-section">
      <h2 onClick={onToggle} style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Chevron isCollapsed={isCollapsed} />
        {title}
      </h2>
      <div 
        ref={contentRef}
        className={`section-content ${isCollapsed ? 'collapsed' : ''}`}
        style={{ maxHeight }}
      >
        {children}
      </div>
    </div>
  )
}

function CalendarView({ entries, currentDate, onAddEntry, onUpdateEntry, onDeleteEntry, clients, defaultStartTime, intervalMinutes, calendarStartTime, calendarEndTime, onEditEntry, editingEntry }) {
  const [dragStartRegion, setDragStartRegion] = useState(null)
  const [dragCurrentRegion, setDragCurrentRegion] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [hoveredTimeRange, setHoveredTimeRange] = useState(null)
  const gridRef = useRef(null)
  const businessWeekDates = getBusinessWeekDates()

  function getBusinessWeekDates() {
    const d = new Date(currentDate)
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -2 : 1)
    const monday = new Date(d.setDate(diff))
    const dates = []
    for (let i = 0; i < 5; i++) {
      const date = new Date(monday)
      date.setDate(date.getDate() + i)
      dates.push(date)
    }
    return dates
  }

  const timeToMinutes = (timeStr) => {
    const [h, m] = timeStr.split(':').map(Number)
    return h * 60 + m
  }

  const minutesToTime = (mins) => {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }

  const roundToInterval = (minutes) => {
    return Math.round(minutes / intervalMinutes) * intervalMinutes
  }

  const floorToInterval = (minutes) => {
    return Math.floor(minutes / intervalMinutes) * intervalMinutes
  }

  const ceilToInterval = (minutes) => {
    return Math.ceil(minutes / intervalMinutes) * intervalMinutes
  }

  const getVisibleMinutes = () => {
    const start = timeToMinutes(calendarStartTime)
    const end = timeToMinutes(calendarEndTime)
    return { start, end, duration: end - start }
  }

  const getDateFromMouseEvent = (e) => {
    const grid = gridRef.current
    if (!grid) return null
    
    const gridRect = grid.getBoundingClientRect()
    const offsetX = e.clientX - gridRect.left
    const columnWidth = (gridRect.width - 80) / 5
    const columnIndex = Math.floor((offsetX - 80) / columnWidth)
    
    if (columnIndex < 0 || columnIndex >= 5) return null
    return businessWeekDates[columnIndex]
  }

  const handleSlotMouseDown = (date, slotMinutes) => {
    setDragStartRegion({ date, minutes: slotMinutes })
    setDragCurrentRegion({ date, minutes: slotMinutes })
    setIsDragging(true)
  }

  const handleSlotMouseEnterDrag = (date, slotMinutes) => {
    if (!isDragging || !dragStartRegion) return
    setDragCurrentRegion({ date, minutes: slotMinutes })
  }

  const handleMouseUp = () => {
    if (!isDragging || !dragStartRegion || !dragCurrentRegion) {
      setDragStartRegion(null)
      setDragCurrentRegion(null)
      setIsDragging(false)
      return
    }

    const startMin = Math.min(dragStartRegion.minutes, dragCurrentRegion.minutes)
    const endMin = Math.max(dragStartRegion.minutes, dragCurrentRegion.minutes) + intervalMinutes

    const dateKey = dragStartRegion.date.toISOString().split('T')[0]

    const newEntry = {
      id: Date.now(),
      startTime: minutesToTime(startMin),
      endTime: minutesToTime(endMin),
      client: '',
      ticket: '',
      description: '',
      disabled: false
    }

    onAddEntry(dateKey, newEntry)
    onEditEntry(newEntry)
    setDragStartRegion(null)
    setDragCurrentRegion(null)
    setIsDragging(false)
  }

  const handleEntryMouseEnter = (entry) => {
    const startMin = timeToMinutes(entry.startTime)
    const endMin = timeToMinutes(entry.endTime)
    setHoveredTimeRange({ start: startMin, end: endMin })
  }

  const handleEntryMouseLeave = () => {
    setHoveredTimeRange(null)
  }

  const isTimeLabelInRange = (min) => {
    if (!hoveredTimeRange) return false
    return min >= hoveredTimeRange.start && min < hoveredTimeRange.end
  }

  const handleSlotMouseEnter = (slotMinutes) => {
    setHoveredTimeRange({ start: slotMinutes, end: slotMinutes + intervalMinutes })
  }

  const handleSlotMouseLeave = () => {
    setHoveredTimeRange(null)
  }

  const getHourMarkers = () => {
    const { start, end } = getVisibleMinutes()
    const markers = []
    for (let min = start; min <= end; min += intervalMinutes) {
      markers.push(min)
    }
    return markers
  }

  const hours = Array.from({ length: 24 }, (_, i) => i)
  const hourMarkers = getHourMarkers()
  const { start: visibleStart, end: visibleEnd, duration: visibleDuration } = getVisibleMinutes()

  return (
    <div className="calendar-view">
      <div className="calendar-header">
        <div className="calendar-time-column"></div>
        {businessWeekDates.map(date => (
          <div key={date.toISOString()} className="calendar-day-header">
            <div className="day-name">{date.toLocaleDateString('en-US', { weekday: 'short' })}</div>
            <div className="day-date">{date.getDate()}</div>
          </div>
        ))}
      </div>

      <div 
        className="calendar-grid"
        ref={gridRef}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div className="calendar-time-column">
          {hourMarkers.map(min => (
            <div 
              key={min} 
              className={`calendar-hour-label ${isTimeLabelInRange(min) ? 'highlighted' : ''}`}
              style={{ height: `${(intervalMinutes / visibleDuration) * 100}%` }}
            >
              {minutesToTime(min)}
            </div>
          ))}
        </div>

        {businessWeekDates.map(date => {
          const dateKey = date.toISOString().split('T')[0]
          const dayEntries = entries[dateKey] || []
          return (
            <div key={dateKey} className="calendar-day-column">
              {hourMarkers.map(min => (
                <div 
                  key={min} 
                  className="calendar-hour-slot" 
                  style={{ height: `${(intervalMinutes / visibleDuration) * 100}%` }}
                  onMouseDown={(e) => {
                    if (e.button === 0 && !e.target.closest('.calendar-entry')) {
                      handleSlotMouseDown(date, min)
                    }
                  }}
                  onMouseEnter={() => {
                    handleSlotMouseEnter(min)
                    handleSlotMouseEnterDrag(date, min)
                  }}
                  onMouseLeave={handleSlotMouseLeave}
                ></div>
              ))}
              
              {isDragging && dragStartRegion && dragCurrentRegion && 
               dragStartRegion.date.toISOString().split('T')[0] === dateKey && (
                <div
                  className="calendar-drag-preview"
                  style={{
                    top: `${((Math.min(dragStartRegion.minutes, dragCurrentRegion.minutes) - visibleStart) / visibleDuration) * 100}%`,
                    height: `calc(${((Math.max(dragStartRegion.minutes, dragCurrentRegion.minutes) + intervalMinutes - Math.min(dragStartRegion.minutes, dragCurrentRegion.minutes)) / visibleDuration) * 100}% - 8px)`
                  }}
                >
                  <div className="preview-time">
                    {minutesToTime(Math.min(dragStartRegion.minutes, dragCurrentRegion.minutes))} - {minutesToTime(Math.max(dragStartRegion.minutes, dragCurrentRegion.minutes) + intervalMinutes)}
                  </div>
                </div>
              )}

              {dayEntries.map(entry => {
                const startMin = timeToMinutes(entry.startTime)
                const endMin = timeToMinutes(entry.endTime)
                
                if (endMin < visibleStart || startMin > visibleEnd) return null

                const clampedStart = Math.max(startMin, visibleStart)
                const clampedEnd = Math.min(endMin, visibleEnd)
                
                const topPercent = ((clampedStart - visibleStart) / visibleDuration) * 100
                const heightPercent = ((clampedEnd - clampedStart) / visibleDuration) * 100
                
                return (
                  <div
                    key={entry.id}
                    className={`calendar-entry ${entry.disabled ? 'disabled' : ''}`}
                    style={{
                      top: `${topPercent}%`,
                      height: `calc(${heightPercent}% - 8px)`
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      onEditEntry(entry)
                    }}
                    onMouseEnter={() => handleEntryMouseEnter(entry)}
                    onMouseLeave={handleEntryMouseLeave}
                  >
                    <div className="entry-client">{entry.client}</div>
                    <div className="entry-ticket">{entry.ticket}</div>
                    <div className="entry-description">{entry.description}</div>
                    <button
                      className="entry-delete"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteEntry(dateKey, entry.id)
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {editingEntry && (
        <div className="calendar-modal-overlay" onClick={() => onEditEntry(null)}>
          <div className="calendar-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Edit Entry</h3>
            <div className="modal-field">
              <label>Start Time</label>
              <input
                type="time"
                value={editingEntry.startTime}
                onChange={(e) => onEditEntry({ ...editingEntry, startTime: e.target.value })}
              />
            </div>
            <div className="modal-field">
              <label>End Time</label>
              <input
                type="time"
                value={editingEntry.endTime}
                onChange={(e) => onEditEntry({ ...editingEntry, endTime: e.target.value })}
              />
            </div>
            <div className="modal-field">
              <label>Client</label>
              <select
                value={editingEntry.client}
                onChange={(e) => onEditEntry({ ...editingEntry, client: e.target.value })}
              >
                <option value="">Select Client</option>
                {clients.map(client => (
                  <option key={client} value={client}>{client}</option>
                ))}
              </select>
            </div>
            <div className="modal-field">
              <label>Ticket #</label>
              <input
                type="text"
                value={editingEntry.ticket}
                onChange={(e) => onEditEntry({ ...editingEntry, ticket: e.target.value })}
              />
            </div>
            <div className="modal-field">
              <label>Description</label>
              <textarea
                value={editingEntry.description}
                onChange={(e) => onEditEntry({ ...editingEntry, description: e.target.value })}
                rows="3"
              />
            </div>
            <div className="modal-buttons">
              <button className="btn-cancel" onClick={() => onEditEntry(null)}>Cancel</button>
              <button className="btn-save" onClick={() => {
                onUpdateEntry(editingEntry)
                onEditEntry(null)
              }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function App() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [currentView, setCurrentView] = useState(() => {
    const saved = localStorage.getItem('currentView')
    return saved || 'task'
  })
  const [entries, setEntries] = useState(() => {
    const saved = localStorage.getItem('timeEntries')
    return saved ? JSON.parse(saved) : {}
  })
  const [clients, setClients] = useState(() => {
    const saved = localStorage.getItem('clients')
    return saved ? JSON.parse(saved) : []
  })
  const [jiraBaseUrl, setJiraBaseUrl] = useState(() => {
    const saved = localStorage.getItem('jiraBaseUrl')
    return saved || ''
  })
  const [defaultStartTime, setDefaultStartTime] = useState(() => {
    const saved = localStorage.getItem('defaultStartTime')
    return saved || '09:00'
  })
  const [calendarInterval, setCalendarInterval] = useState(() => {
    const saved = localStorage.getItem('calendarInterval')
    return saved ? parseInt(saved) : 15
  })
  const [calendarStartTime, setCalendarStartTime] = useState(() => {
    const saved = localStorage.getItem('calendarStartTime')
    return saved || '00:00'
  })
  const [calendarEndTime, setCalendarEndTime] = useState(() => {
    const saved = localStorage.getItem('calendarEndTime')
    return saved || '24:00'
  })
  const [editingEntry, setEditingEntry] = useState(null)
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode')
    return saved ? JSON.parse(saved) : false
  })
  const [sidebarVisible, setSidebarVisible] = useState(() => {
    const saved = localStorage.getItem('sidebarVisible')
    return saved ? JSON.parse(saved) : true
  })
  const [collapsedSections, setCollapsedSections] = useState(() => {
    const saved = localStorage.getItem('collapsedSections')
    return saved ? JSON.parse(saved) : {}
  })
  const [newClient, setNewClient] = useState('')
  const isInitialMount = useRef(true)

  const dateKey = currentDate.toISOString().split('T')[0]

  useEffect(() => {
    isInitialMount.current = false
  }, [])

  useEffect(() => {
    if (!isInitialMount.current) {
      localStorage.setItem('timeEntries', JSON.stringify(entries))
      console.log('Saved entries to localStorage:', entries)
    }
  }, [entries])

  useEffect(() => {
    if (!isInitialMount.current) {
      localStorage.setItem('clients', JSON.stringify(clients))
      console.log('Saved clients to localStorage:', clients)
    }
  }, [clients])

  useEffect(() => {
    if (!isInitialMount.current) {
      localStorage.setItem('jiraBaseUrl', jiraBaseUrl)
      console.log('Saved jiraBaseUrl to localStorage:', jiraBaseUrl)
    }
  }, [jiraBaseUrl])

  useEffect(() => {
    if (!isInitialMount.current) {
      localStorage.setItem('defaultStartTime', defaultStartTime)
      console.log('Saved defaultStartTime to localStorage:', defaultStartTime)
    }
  }, [defaultStartTime])

  useEffect(() => {
    if (!isInitialMount.current) {
      localStorage.setItem('darkMode', JSON.stringify(darkMode))
      console.log('Saved darkMode to localStorage:', darkMode)
    }
    document.body.classList.toggle('dark-mode', darkMode)
  }, [darkMode])

  useEffect(() => {
    if (!isInitialMount.current) {
      localStorage.setItem('sidebarVisible', JSON.stringify(sidebarVisible))
      console.log('Saved sidebarVisible to localStorage:', sidebarVisible)
    }
  }, [sidebarVisible])

  useEffect(() => {
    if (!isInitialMount.current) {
      localStorage.setItem('collapsedSections', JSON.stringify(collapsedSections))
      console.log('Saved collapsedSections to localStorage:', collapsedSections)
    }
  }, [collapsedSections])

  useEffect(() => {
    if (!isInitialMount.current) {
      localStorage.setItem('currentView', currentView)
      console.log('Saved currentView to localStorage:', currentView)
    }
  }, [currentView])

  useEffect(() => {
    if (!isInitialMount.current) {
      localStorage.setItem('calendarInterval', String(calendarInterval))
      console.log('Saved calendarInterval to localStorage:', calendarInterval)
    }
  }, [calendarInterval])

  useEffect(() => {
    if (!isInitialMount.current) {
      localStorage.setItem('calendarStartTime', calendarStartTime)
      console.log('Saved calendarStartTime to localStorage:', calendarStartTime)
    }
  }, [calendarStartTime])

  useEffect(() => {
    if (!isInitialMount.current) {
      localStorage.setItem('calendarEndTime', calendarEndTime)
      console.log('Saved calendarEndTime to localStorage:', calendarEndTime)
    }
  }, [calendarEndTime])

  const getDayEntries = () => {
    if (currentView === 'task') {
      return entries[dateKey] || []
    }
    return []
  }

  const updateDayEntries = (newEntries, specificDateKey = null) => {
    const key = specificDateKey || dateKey
    setEntries(prev => ({ ...prev, [key]: newEntries }))
  }

  const addCalendarEntry = (specificDateKey, newEntry) => {
    const dayEntries = entries[specificDateKey] || []
    updateDayEntries([...dayEntries, newEntry], specificDateKey)
  }

  const deleteCalendarEntry = (specificDateKey, entryId) => {
    const dayEntries = entries[specificDateKey] || []
    updateDayEntries(dayEntries.filter(e => e.id !== entryId), specificDateKey)
  }

  const updateCalendarEntry = (updatedEntry) => {
    for (const dateKey in entries) {
      const index = entries[dateKey].findIndex(e => e.id === updatedEntry.id)
      if (index !== -1) {
        const updated = [...entries[dateKey]]
        updated[index] = updatedEntry
        updateDayEntries(updated, dateKey)
        return
      }
    }
  }

  const addEntry = () => {
    const dayEntries = getDayEntries()
    const lastEntry = dayEntries[dayEntries.length - 1]
    
    // Don't allow adding a new entry if the last one doesn't have an end time
    if (lastEntry && !lastEntry.endTime) {
      return
    }
    
    const newEntry = {
      id: Date.now(),
      startTime: lastEntry ? lastEntry.endTime : defaultStartTime,
      endTime: '',
      client: '',
      ticket: '',
      description: '',
      disabled: false
    }
    
    updateDayEntries([...dayEntries, newEntry])
  }

  const updateEntry = (id, field, value) => {
    const dayEntries = getDayEntries()
    const index = dayEntries.findIndex(e => e.id === id)
    
    if (index === -1) return

    const updatedEntries = [...dayEntries]
    
    // If end time is before start time, add 12 hours to make it afternoon
    if (field === 'endTime' && value && value.includes(':')) {
      const startTime = dayEntries[index].startTime
      if (startTime) {
        const [startH, startM] = startTime.split(':').map(Number)
        const [endH, endM] = value.split(':').map(Number)
        const startMinutes = startH * 60 + startM
        const endMinutes = endH * 60 + endM
        
        if (endMinutes < startMinutes) {
          const adjustedHours = (endH + 12) % 24
          value = `${String(adjustedHours).padStart(2, '0')}:${String(endM).padStart(2, '0')}`
        }
      }
    }

    updatedEntries[index] = { ...updatedEntries[index], [field]: value }

    if (field === 'endTime' && value && index < updatedEntries.length - 1) {
      updatedEntries[index + 1] = { ...updatedEntries[index + 1], startTime: value }
    }

    updateDayEntries(updatedEntries)
  }

  const deleteEntry = (id) => {
    const dayEntries = getDayEntries()
    updateDayEntries(dayEntries.filter(e => e.id !== id))
  }

  const handleDragStart = (e, index) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/html', index)
  }

  const handleDragOver = (e, index) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e, dropIndex) => {
    e.preventDefault()
    const dragIndex = parseInt(e.dataTransfer.getData('text/html'))
    
    if (dragIndex === dropIndex) return
    
    const dayEntries = getDayEntries()
    const newEntries = [...dayEntries]
    const [draggedItem] = newEntries.splice(dragIndex, 1)
    newEntries.splice(dropIndex, 0, draggedItem)
    
    updateDayEntries(newEntries)
  }

  const addMinutes = (time, minutes) => {
    const [hours, mins] = time.split(':').map(Number)
    const totalMinutes = hours * 60 + mins + minutes
    const newHours = Math.floor(totalMinutes / 60) % 24
    const newMins = totalMinutes % 60
    return `${String(newHours).padStart(2, '0')}:${String(newMins).padStart(2, '0')}`
  }

  const calculateTotalHours = () => {
    const dayEntries = entries[dateKey] || []
    let totalMinutes = 0

    dayEntries.forEach(entry => {
      if (entry.startTime && entry.endTime) {
        const [startH, startM] = entry.startTime.split(':').map(Number)
        const [endH, endM] = entry.endTime.split(':').map(Number)
        const start = startH * 60 + startM
        const end = endH * 60 + endM
        totalMinutes += end - start
      }
    })

    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return `${hours}h ${minutes}m`
  }

  const changeDate = (days) => {
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

  const removeClient = (client) => {
    setClients(clients.filter(c => c !== client))
  }

  const getJiraUrl = (client, ticket) => {
    if (jiraBaseUrl && client && ticket) {
      return `${jiraBaseUrl}/${client}-${ticket}`
    }
    return null
  }

  const getSummary = () => {
    const dayEntries = entries[dateKey] || []
    const summary = {}

    dayEntries.forEach(entry => {
      if (entry.client && entry.ticket && entry.startTime && entry.endTime) {
        const key = `${entry.client}-${entry.ticket}`
        
        const [startH, startM] = entry.startTime.split(':').map(Number)
        const [endH, endM] = entry.endTime.split(':').map(Number)
        const start = startH * 60 + startM
        const end = endH * 60 + endM
        const minutes = end - start

        if (!summary[key]) {
          summary[key] = {
            client: entry.client,
            ticket: entry.ticket,
            minutes: 0,
            descriptions: [],
            allDisabled: true,
            entryIds: []
          }
        }
        summary[key].minutes += minutes
        summary[key].entryIds.push(entry.id)
        if (!entry.disabled) {
          summary[key].allDisabled = false
        }
        if (entry.description && entry.description.trim()) {
          summary[key].descriptions.push(entry.description.trim())
        }
      }
    })

    const summaryArray = Object.entries(summary).map(([key, data]) => ({
      key,
      ...data,
      hours: (data.minutes / 60).toFixed(2)
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
    const clientTotals = {}

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

  const toggleSummaryEntries = (entryIds, disabled) => {
    const dayEntries = entries[dateKey] || []
    const updatedEntries = dayEntries.map(entry => {
      if (entryIds.includes(entry.id)) {
        return { ...entry, disabled }
      }
      return entry
    })
    updateDayEntries(updatedEntries)
  }

  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })
  }

  const handleCalendarClick = () => {
    document.getElementById('date-picker').showPicker()
  }

  const toggleSection = (sectionName) => {
    setCollapsedSections(prev => ({
      ...prev,
      [sectionName]: !prev[sectionName]
    }))
  }

  return (
    <div className="app">
      <div className="main-content">
        <button 
          className="sidebar-toggle-button"
          onClick={() => setSidebarVisible(!sidebarVisible)}
          title={sidebarVisible ? 'Hide Sidebar' : 'Show Sidebar'}
        >
          {sidebarVisible ? '›' : '‹'}
        </button>
        <div className="header">
          <h1>Time Tracker</h1>
          <div className="view-toggle">
            <button 
              className={`view-button ${currentView === 'task' ? 'active' : ''}`}
              onClick={() => setCurrentView('task')}
            >
              Task View
            </button>
            <button 
              className={`view-button ${currentView === 'calendar' ? 'active' : ''}`}
              onClick={() => setCurrentView('calendar')}
            >
              Calendar View
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
          </div>
        </div>

        {currentView === 'task' ? (
          <>
            <div className="time-entries">
              {getDayEntries().map((entry, index) => (
                <div 
                  key={entry.id} 
                  className="time-entry" 
                  style={{ opacity: entry.disabled ? 0.5 : 1, cursor: 'move' }}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={(e) => handleDrop(e, index)}
                >
                  <input
                    type="checkbox"
                    checked={entry.disabled || false}
                    onChange={(e) => updateEntry(entry.id, 'disabled', e.target.checked)}
                    title="Disable this entry"
                  />
                  <input
                    type="time"
                    value={entry.startTime}
                    onChange={(e) => updateEntry(entry.id, 'startTime', e.target.value)}
                    disabled={entry.disabled}
                  />
                  <input
                    type="time"
                    value={entry.endTime}
                    onChange={(e) => updateEntry(entry.id, 'endTime', e.target.value)}
                    disabled={entry.disabled}
                  />
                  <select
                    value={entry.client}
                    onChange={(e) => updateEntry(entry.id, 'client', e.target.value)}
                    disabled={entry.disabled}
                  >
                    <option value="">Select Client</option>
                    {clients.map(client => (
                      <option key={client} value={client}>{client}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Ticket #"
                    value={entry.ticket}
                    onChange={(e) => updateEntry(entry.id, 'ticket', e.target.value)}
                    disabled={entry.disabled}
                  />
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <input
                      type="text"
                      placeholder="Description (optional)"
                      value={entry.description}
                      onChange={(e) => updateEntry(entry.id, 'description', e.target.value)}
                      style={{ flex: 1 }}
                      disabled={entry.disabled}
                    />
                    {getJiraUrl(entry.client, entry.ticket) && (
                      <a 
                        href={getJiraUrl(entry.client, entry.ticket)} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="jira-link"
                        style={{ fontSize: '20px', marginLeft: '8px' }}
                      >
                        🔗
                      </a>
                    )}
                  </div>
                  <button onClick={() => deleteEntry(entry.id)} disabled={entry.disabled}>✕</button>
                </div>
              ))}
              <button 
                className="add-entry-button" 
                onClick={addEntry}
                disabled={getDayEntries().length > 0 && !getDayEntries()[getDayEntries().length - 1].endTime}
                style={{ 
                  opacity: getDayEntries().length > 0 && !getDayEntries()[getDayEntries().length - 1].endTime ? 0.5 : 1,
                  cursor: getDayEntries().length > 0 && !getDayEntries()[getDayEntries().length - 1].endTime ? 'not-allowed' : 'pointer'
                }}
              >
                + Add Time Entry
              </button>
            </div>

            <div className="total-hours">
              Total: {calculateTotalHours()}
            </div>
          </>
        ) : (
          <CalendarView
            entries={entries}
            currentDate={currentDate}
            onAddEntry={addCalendarEntry}
            onUpdateEntry={updateCalendarEntry}
            onDeleteEntry={deleteCalendarEntry}
            clients={clients}
            defaultStartTime={defaultStartTime}
            intervalMinutes={calendarInterval}
            calendarStartTime={calendarStartTime}
            calendarEndTime={calendarEndTime}
            onEditEntry={setEditingEntry}
            editingEntry={editingEntry}
          />
        )}
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
                <li key={item.key} className="client-item" style={{ flexDirection: 'column', alignItems: 'flex-start', position: 'relative', paddingBottom: '35px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                    <div>
                      {jiraBaseUrl ? (
                        <a 
                          href={getJiraUrl(item.client, item.ticket)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="summary-link"
                        >
                          {item.key}
                        </a>
                      ) : (
                        <strong>{item.key}</strong>
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
                  <div style={{ position: 'absolute', bottom: '10px', right: '10px' }}>
                    <input
                      type="checkbox"
                      checked={item.allDisabled}
                      onChange={(e) => toggleSummaryEntries(item.entryIds, e.target.checked)}
                      title="Toggle all entries for this ticket"
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div style={{ color: '#999', fontSize: '14px', padding: '10px' }}>
              No entries with client and ticket yet
            </div>
          )}
        </CollapsibleSection>

        <CollapsibleSection 
          title="Clients" 
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
            {clients.map(client => {
              const clientTotals = getClientTotals()
              const totalHours = clientTotals[client] ? (clientTotals[client] / 60).toFixed(2) : '0.00'
              return (
                <li key={client} className="client-item">
                  <span>
                    {client}
                    {clientTotals[client] && clientTotals[client] > 0 && (
                      <span style={{ color: '#999', fontSize: '12px', marginLeft: '8px' }}>
                        ({totalHours}h)
                      </span>
                    )}
                  </span>
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
    </div>
  )
}

export default App
