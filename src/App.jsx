import { useState, useEffect, useRef } from 'react'

function App() {
  const [currentDate, setCurrentDate] = useState(new Date())
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
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode')
    return saved ? JSON.parse(saved) : false
  })
  const [sidebarVisible, setSidebarVisible] = useState(() => {
    const saved = localStorage.getItem('sidebarVisible')
    return saved ? JSON.parse(saved) : true
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

  const getDayEntries = () => {
    return entries[dateKey] || []
  }

  const updateDayEntries = (newEntries) => {
    setEntries(prev => ({ ...prev, [dateKey]: newEntries }))
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
    const dayEntries = getDayEntries()
    let totalMinutes = 0

    dayEntries.forEach(entry => {
      const [startH, startM] = entry.startTime.split(':').map(Number)
      const [endH, endM] = entry.endTime.split(':').map(Number)
      const start = startH * 60 + startM
      const end = endH * 60 + endM
      totalMinutes += end - start
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
    const dayEntries = getDayEntries()
    const summary = {}

    dayEntries.forEach(entry => {
      if (entry.client && entry.ticket) {
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

  const toggleSummaryEntries = (entryIds, disabled) => {
    const dayEntries = getDayEntries()
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
      </div>

      {sidebarVisible && (
        <div className="sidebar-container">
        <div className="sidebar">
        <div className="sidebar-section">
          <h2>Summary</h2>
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
                      {item.descriptions.map((desc, idx) => (
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
        </div>

        <div className="sidebar-section">
          <h2>Clients</h2>
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
            {clients.map(client => (
              <li key={client} className="client-item">
                <span>{client}</span>
                <button onClick={() => removeClient(client)}>Remove</button>
              </li>
            ))}
          </ul>
        </div>

        <div className="sidebar-section">
          <h2>Jira Base URL</h2>
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

        <div className="sidebar-section">
          <h2>Default Start Time</h2>
          <input
            type="time"
            value={defaultStartTime}
            onChange={(e) => setDefaultStartTime(e.target.value)}
          />
          <div style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
            New entries will start at {defaultStartTime} (if no previous entries)
          </div>
        </div>

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
