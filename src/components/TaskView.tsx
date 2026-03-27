import type { DragEvent } from 'react'
import type { TimeEntry } from '../services/types'
import type { TaskViewProps } from '../types/app'

function TaskView({
  dayEntries,
  clients,
  defaultStartTime,
  onUpdateDayEntries,
  getJiraUrl,
  isEntryUntracked
}: TaskViewProps) {
  const updateEntry = (id: number, field: keyof TimeEntry, value: string | boolean) => {
    const index = dayEntries.findIndex((entry) => entry.id === id)
    if (index === -1) return

    const updatedEntries = [...dayEntries]

    if (field === 'endTime' && typeof value === 'string' && value.includes(':')) {
      const startTime = dayEntries[index].startTime
      if (startTime) {
        const [startH, startM] = startTime.split(':').map(Number)
        const [endH, endM] = value.split(':').map(Number)
        const startMinutes = startH * 60 + startM
        const endMinutes = endH * 60 + endM

        if (endMinutes < startMinutes) {
          value = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`
        }
      }
    }

    updatedEntries[index] = { ...updatedEntries[index], [field]: value }

    if (field === 'endTime' && typeof value === 'string' && index < updatedEntries.length - 1) {
      updatedEntries[index + 1] = { ...updatedEntries[index + 1], startTime: value }
    }

    onUpdateDayEntries(updatedEntries)
  }

  const addEntry = () => {
    const lastEntry = dayEntries[dayEntries.length - 1]
    if (lastEntry && !lastEntry.endTime) return

    const newEntry: TimeEntry = {
      id: Date.now(),
      startTime: lastEntry ? lastEntry.endTime : defaultStartTime,
      endTime: '',
      client: '',
      ticket: '',
      description: '',
      disabled: false,
      tags: []
    }

    onUpdateDayEntries([...dayEntries, newEntry])
  }

  const deleteEntry = (id: number): void => {
    onUpdateDayEntries(dayEntries.filter((entry) => entry.id !== id))
  }

  const handleDragStart = (e: DragEvent<HTMLDivElement>, index: number): void => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/html', String(index))
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>, dropIndex: number): void => {
    e.preventDefault()
    const dragIndex = parseInt(e.dataTransfer.getData('text/html'), 10)
    if (
      !Number.isFinite(dragIndex) ||
      !Number.isInteger(dragIndex) ||
      dragIndex < 0 ||
      dragIndex >= dayEntries.length
    ) {
      return
    }
    if (dropIndex < 0 || dropIndex >= dayEntries.length) return
    if (dragIndex === dropIndex) return

    const updated = [...dayEntries]
    const [draggedItem] = updated.splice(dragIndex, 1)
    updated.splice(dropIndex, 0, draggedItem)
    onUpdateDayEntries(updated)
  }

  const calculateTotalHours = () => {
    let totalMinutes = 0

    dayEntries.forEach((entry) => {
      if (entry.startTime && entry.endTime) {
        const [startH, startM] = entry.startTime.split(':').map(Number)
        const [endH, endM] = entry.endTime.split(':').map(Number)
        totalMinutes += endH * 60 + endM - (startH * 60 + startM)
      }
    })

    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return `${hours}h ${minutes}m`
  }

  const hasOpenLastEntry = dayEntries.length > 0 && !dayEntries[dayEntries.length - 1].endTime

  return (
    <>
      <div className="time-entries">
        {dayEntries.map((entry, index) => (
          <div
            key={entry.id}
            className="time-entry"
            style={{ opacity: entry.disabled ? 0.5 : 1, cursor: 'move' }}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, index)}
          >
            <input
              type="checkbox"
              checked={entry.disabled || false}
              disabled={isEntryUntracked(entry)}
              onChange={(e) => {
                if (isEntryUntracked(entry) && e.target.checked) return
                updateEntry(entry.id, 'disabled', e.target.checked)
              }}
              title={isEntryUntracked(entry) ? 'Untracked entries cannot be marked as logged' : 'Mark as logged'}
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
              {clients.map((client) => (
                <option key={client} value={client}>
                  {client}
                </option>
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
                <a href={getJiraUrl(entry.client, entry.ticket)} target="_blank" rel="noopener noreferrer" className="jira-link" style={{ fontSize: '20px', marginLeft: '8px' }}>
                  🔗
                </a>
              )}
            </div>
            <button onClick={() => deleteEntry(entry.id)} disabled={entry.disabled}>
              ✕
            </button>
          </div>
        ))}
        <button
          className="add-entry-button"
          onClick={addEntry}
          disabled={hasOpenLastEntry}
          style={{
            opacity: hasOpenLastEntry ? 0.5 : 1,
            cursor: hasOpenLastEntry ? 'not-allowed' : 'pointer'
          }}
        >
          + Add Time Entry
        </button>
      </div>

      <div className="total-hours">Total: {calculateTotalHours()}</div>
    </>
  )
}

export default TaskView
