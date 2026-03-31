import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, MouseEvent as ReactMouseEvent } from 'react'
import type { TimeEntry } from '../services/types'
import type { CalendarViewProps, EditableTimeEntry } from '../types/app'

type ResizeEdge = 'top' | 'bottom'

interface DragRegion {
  date: Date
  minutes: number
}

interface HoveredTimeRange {
  start: number
  end: number
}

interface GridMetrics {
  scrollHeight: number
}

interface LatestTicketOption {
  key: string
  client: string
  ticket: string
  label: string
}

function getContrastColor(hexColor: string): string {
  const hex = hexColor.replace('#', '')
  const r = parseInt(hex.substr(0, 2), 16)
  const g = parseInt(hex.substr(2, 2), 16)
  const b = parseInt(hex.substr(4, 2), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5 ? '#000000' : '#ffffff'
}

function adjustColorBrightness(hexColor: string, percent: number): string {
  const hex = hexColor.replace('#', '')
  const r = Math.max(0, Math.min(255, parseInt(hex.substr(0, 2), 16) + percent))
  const g = Math.max(0, Math.min(255, parseInt(hex.substr(2, 2), 16) + percent))
  const b = Math.max(0, Math.min(255, parseInt(hex.substr(4, 2), 16) + percent))
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')
}

function CalendarView({ entries, now, currentDate, onAddEntry, onUpdateEntry, onDeleteEntry, clients, clientColors, defaultStartTime, intervalMinutes, calendarStartTime, calendarEndTime, onEditEntry, editingEntry, editingEntryDateKey, ticketOptions, tagTypes, isEntryUntracked, style }: CalendarViewProps) {
  const [dragStartRegion, setDragStartRegion] = useState<DragRegion | null>(null)
  const [dragCurrentRegion, setDragCurrentRegion] = useState<DragRegion | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [hoveredTimeRange, setHoveredTimeRange] = useState<HoveredTimeRange | null>(null)
  const [resizingEntry, setResizingEntry] = useState<EditableTimeEntry | null>(null)
  const [resizeEdge, setResizeEdge] = useState<ResizeEdge | null>(null)
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)
  const [quickTicketSelection, setQuickTicketSelection] = useState('')
  const [gridMetrics, setGridMetrics] = useState<GridMetrics>({ scrollHeight: 0 })
  const gridRef = useRef<HTMLDivElement | null>(null)
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null)
  const businessWeekDates = getBusinessWeekDates()
  const allTicketOptions = [...ticketOptions.pinned, ...ticketOptions.todos, ...ticketOptions.recent]
  const formatLocalDate = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  const timeToMinutes = (timeStr: string): number => {
    const [h, m] = timeStr.split(':').map(Number)
    return h * 60 + m
  }
  const latestTicketOption = (() => {
    const targetDateKey = editingEntryDateKey || formatLocalDate(currentDate)
    const dayEntries = entries[targetDateKey] || []
    const trackedEntries = dayEntries.filter((entry) => entry.client.trim() && entry.ticket.trim())
    if (trackedEntries.length === 0) return null

    const latestEntry = [...trackedEntries].sort((a, b) => {
      const endDiff = timeToMinutes(b.endTime) - timeToMinutes(a.endTime)
      if (endDiff !== 0) return endDiff

      const startDiff = timeToMinutes(b.startTime) - timeToMinutes(a.startTime)
      if (startDiff !== 0) return startDiff

      return b.id - a.id
    })[0]

    const client = latestEntry.client.trim()
    const ticket = latestEntry.ticket.trim()
    if (!client || !ticket) return null

    const matchingOption = allTicketOptions.find((option) => option.client === client && option.ticket === ticket)
    const label = matchingOption?.friendlyName?.trim()
      ? `Latest entry: ${matchingOption.friendlyName.trim()} (${client}-${ticket})`
      : `Latest entry: ${client}-${ticket}`

    return {
      key: '__latest_entry__',
      client,
      ticket,
      label
    } satisfies LatestTicketOption
  })()
  const selectedEntryTags = editingEntry?.tags || []
  const availableTagTypes = (() => {
    const options = [...tagTypes]
    const seen = new Set(options.map((tag) => tag.toLowerCase()))

    selectedEntryTags.forEach((tag) => {
      const trimmedTag = tag.trim()
      if (!trimmedTag) return
      const lookup = trimmedTag.toLowerCase()
      if (seen.has(lookup)) return
      seen.add(lookup)
      options.push(trimmedTag)
    })

    return options
  })()
  const normalizedSelectedTags = (() => {
    const optionsByLookup = new Map(availableTagTypes.map((tag) => [tag.toLowerCase(), tag]))
    const seen = new Set<string>()
    const normalized: string[] = []

    selectedEntryTags.forEach((tag) => {
      const trimmedTag = tag.trim()
      if (!trimmedTag) return

      const lookup = trimmedTag.toLowerCase()
      if (seen.has(lookup)) return

      seen.add(lookup)
      normalized.push(optionsByLookup.get(lookup) || trimmedTag)
    })

    return normalized
  })()
  const resizeDescriptionTextarea = (element: HTMLTextAreaElement | null): void => {
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight}px`
  }

  const handleSave = async () => {
    if (!editingEntry) return
    const { isNew, ...entryToSave } = editingEntry
    const targetDateKey = editingEntryDateKey || Object.keys(entries).find((k) => entries[k]?.some((e) => e.id === entryToSave.id))
    const result = await onUpdateEntry(entryToSave, targetDateKey)
    if (result?.shouldClose !== false) {
      onEditEntry(null, null)
    }
  }

  const handleDiscardNewEntry = () => {
    if (editingEntry && editingEntry.isNew) {
      for (const dateKey in entries) {
        const dayEntries = entries[dateKey]
        if (dayEntries && dayEntries.some((e) => e.id === editingEntry.id)) {
          onDeleteEntry(dateKey, editingEntry.id)
          break
        }
      }
    }
    setShowCloseConfirm(false)
    onEditEntry(null, null)
  }

  function getBusinessWeekDates(): Date[] {
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

  const minutesToTime = (mins: number): string => {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }

  const getVisibleMinutes = (): { start: number; end: number; duration: number } => {
    const start = timeToMinutes(calendarStartTime)
    const end = timeToMinutes(calendarEndTime)
    return { start, end, duration: end - start }
  }

  const handleSlotMouseDown = (date: Date, slotMinutes: number): void => {
    setDragStartRegion({ date, minutes: slotMinutes })
    setDragCurrentRegion({ date, minutes: slotMinutes })
    setIsDragging(true)
  }

  const handleSlotMouseEnterDrag = (date: Date, slotMinutes: number): void => {
    if (resizingEntry && resizeEdge) {
      const updatedEntry = { ...resizingEntry }
      if (resizeEdge === 'top') {
        const endMinutes = timeToMinutes(resizingEntry.endTime)
        if (slotMinutes < endMinutes) {
          updatedEntry.startTime = minutesToTime(slotMinutes)
          setResizingEntry(updatedEntry)
          void onUpdateEntry(updatedEntry)
        }
      } else {
        const startMinutes = timeToMinutes(resizingEntry.startTime)
        if (slotMinutes + intervalMinutes > startMinutes) {
          updatedEntry.endTime = minutesToTime(slotMinutes + intervalMinutes)
          setResizingEntry(updatedEntry)
          void onUpdateEntry(updatedEntry)
        }
      }
      return
    }

    if (!isDragging || !dragStartRegion) return
    setDragCurrentRegion({ date, minutes: slotMinutes })
  }

  const handleMouseUp = () => {
    if (resizingEntry) {
      setResizingEntry(null)
      setResizeEdge(null)
      setIsDragging(false)
      return
    }

    if (!isDragging || !dragStartRegion || !dragCurrentRegion) {
      setDragStartRegion(null)
      setDragCurrentRegion(null)
      setIsDragging(false)
      return
    }

    const startMin = Math.min(dragStartRegion.minutes, dragCurrentRegion.minutes)
    const endMin = Math.max(dragStartRegion.minutes, dragCurrentRegion.minutes) + intervalMinutes
    const dateKey = formatLocalDate(dragStartRegion.date)

    const newEntry: EditableTimeEntry = {
      id: Date.now(),
      startTime: minutesToTime(startMin),
      endTime: minutesToTime(endMin),
      client: '',
      ticket: '',
      description: '',
      disabled: false,
      tags: [],
      isNew: true,
    }

    onAddEntry(dateKey, newEntry)
    onEditEntry(newEntry, dateKey)
    setDragStartRegion(null)
    setDragCurrentRegion(null)
    setIsDragging(false)
  }

  const handleResizeMouseDown = (e: ReactMouseEvent<HTMLDivElement>, entry: TimeEntry, edge: ResizeEdge, dateKey: string): void => {
    e.stopPropagation()
    e.preventDefault()
    setResizingEntry({ ...entry, dateKey })
    setResizeEdge(edge)
    setIsDragging(true)
  }

  useEffect(() => {
    if (resizingEntry) {
      const handleUp = () => handleMouseUp()
      window.addEventListener('mouseup', handleUp)
      return () => {
        window.removeEventListener('mouseup', handleUp)
      }
    }
  }, [resizingEntry, resizeEdge])

  useEffect(() => {
    setQuickTicketSelection('')
  }, [editingEntry?.id])

  useEffect(() => {
    resizeDescriptionTextarea(descriptionRef.current)
  }, [editingEntry?.id, editingEntry?.description])

  useEffect(() => {
    const updateGridMetrics = (): void => {
      const grid = gridRef.current
      if (!grid) return

      setGridMetrics((prev) => {
        const next = { scrollHeight: grid.scrollHeight }
        if (prev.scrollHeight === next.scrollHeight) {
          return prev
        }
        return next
      })
    }

    const grid = gridRef.current
    if (!grid) return

    updateGridMetrics()
    window.addEventListener('resize', updateGridMetrics)

    return () => {
      window.removeEventListener('resize', updateGridMetrics)
    }
  }, [entries, intervalMinutes, calendarStartTime, calendarEndTime])

  const handleEntryMouseEnter = (entry: TimeEntry): void => {
    const startMin = timeToMinutes(entry.startTime)
    const endMin = timeToMinutes(entry.endTime)
    setHoveredTimeRange({ start: startMin, end: endMin })
  }

  const isTimeLabelInRange = (min: number): boolean => {
    if (!hoveredTimeRange) return false
    return min >= hoveredTimeRange.start && min < hoveredTimeRange.end
  }

  const getHourMarkers = () => {
    const { start, end } = getVisibleMinutes()
    const markers = []
    for (let min = start; min < end; min += intervalMinutes) {
      markers.push(min)
    }
    return markers
  }

  const hourMarkers = getHourMarkers()
  const { start: visibleStart, end: visibleEnd, duration: visibleDuration } = getVisibleMinutes()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const currentTimeMode = currentMinutes <= visibleStart ? 'before' : currentMinutes >= visibleEnd ? 'after' : 'within'
  const currentTimeTopPercentRaw = currentTimeMode === 'before' ? 0 : currentTimeMode === 'after' ? 100 : ((currentMinutes - visibleStart) / visibleDuration) * 100
  const currentTimeTopPercent = Math.max(0, Math.min(100, currentTimeTopPercentRaw))
  const currentTimeLineTop = currentTimeMode === 'after' ? 'calc(100% - 2px)' : `${currentTimeTopPercent}%`
  const currentTimeLabelTop = currentTimeMode === 'before' ? 'calc(0% + 4px)' : 'calc(100% - 4px)'
  const currentTimeLabel = minutesToTime(currentMinutes)
  const overlayHeight = gridMetrics.scrollHeight > 0 ? gridMetrics.scrollHeight : gridRef.current?.clientHeight ?? 0
  const currentTimeLabelWithinTop = `${currentTimeTopPercent}%`

  const handleQuickTicketSelect = (value: string): void => {
    setQuickTicketSelection(value)
    if (!editingEntry || !value) return

    if (value === latestTicketOption?.key) {
      onEditEntry({
        ...editingEntry,
        client: latestTicketOption.client,
        ticket: latestTicketOption.ticket
      }, editingEntryDateKey)
      setQuickTicketSelection('')
      return
    }

    const selectedOption = allTicketOptions.find((option) => option.key === value)
    if (!selectedOption) return

    onEditEntry({
      ...editingEntry,
      client: selectedOption.client,
      ticket: selectedOption.ticket
    }, editingEntryDateKey)
    setQuickTicketSelection('')
  }

  const handleTagSelectionChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    if (!editingEntry) return

    const nextTags = Array.from(event.currentTarget.selectedOptions, (option) => option.value)
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0)

    const normalizedTags: string[] = []
    const seen = new Set<string>()

    nextTags.forEach((tag) => {
      const lookup = tag.toLowerCase()
      if (seen.has(lookup)) return
      seen.add(lookup)
      normalizedTags.push(tag)
    })

    onEditEntry({
      ...editingEntry,
      tags: normalizedTags
    }, editingEntryDateKey)
  }

  return (
    <div className="calendar-view" style={style}>
      <div className="calendar-header">
        <div className="calendar-time-column"></div>
        {businessWeekDates.map((date) => (
          <div key={formatLocalDate(date)} className="calendar-day-header">
            <div className="day-name">{date.toLocaleDateString('en-US', { weekday: 'short' })}</div>
            <div className="day-date">{date.getDate()}</div>
          </div>
        ))}
      </div>

      <div className="calendar-grid" ref={gridRef} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
        <div className="calendar-time-column">
          {hourMarkers.map((min) => (
            <div
              key={min}
              className={`calendar-hour-label ${isTimeLabelInRange(min) ? 'highlighted' : ''}`}
              style={{ height: `${(intervalMinutes / visibleDuration) * 100}%` }}
            >
              {minutesToTime(min)} – {minutesToTime(min + intervalMinutes)}
            </div>
          ))}
        </div>

        {businessWeekDates.map((date) => {
          const dateKey = formatLocalDate(date)
          const dayEntries = entries[dateKey] || []
          return (
            <div key={dateKey} className="calendar-day-column">
              {hourMarkers.map((min) => (
                <div
                  key={min}
                  className="calendar-hour-slot"
                  style={{ height: `${(intervalMinutes / visibleDuration) * 100}%` }}
                  onMouseDown={(e) => {
                    if (e.button === 0 && !(e.target as HTMLElement).closest('.calendar-entry')) {
                      handleSlotMouseDown(date, min)
                    }
                  }}
                  onMouseEnter={() => {
                    setHoveredTimeRange({ start: min, end: min + intervalMinutes })
                    handleSlotMouseEnterDrag(date, min)
                  }}
                  onMouseLeave={() => setHoveredTimeRange(null)}
                ></div>
              ))}

              {isDragging && dragStartRegion && dragCurrentRegion && formatLocalDate(dragStartRegion.date) === dateKey && (
                <div
                  className="calendar-drag-preview"
                  style={{
                    top: `${((Math.min(dragStartRegion.minutes, dragCurrentRegion.minutes) - visibleStart) / visibleDuration) * 100}%`,
                    height: `calc(${((Math.max(dragStartRegion.minutes, dragCurrentRegion.minutes) + intervalMinutes - Math.min(dragStartRegion.minutes, dragCurrentRegion.minutes)) / visibleDuration) * 100}% - 8px)`,
                  }}
                >
                  <div className="preview-time">
                    {minutesToTime(Math.min(dragStartRegion.minutes, dragCurrentRegion.minutes))} - {minutesToTime(Math.max(dragStartRegion.minutes, dragCurrentRegion.minutes) + intervalMinutes)}
                  </div>
                </div>
              )}

              {dayEntries.map((entry) => {
                const startMin = timeToMinutes(entry.startTime)
                const endMin = timeToMinutes(entry.endTime)
                const durationHours = ((endMin - startMin) / 60).toFixed(2)

                if (endMin < visibleStart || startMin > visibleEnd) return null

                const clampedStart = Math.max(startMin, visibleStart)
                const clampedEnd = Math.min(endMin, visibleEnd)
                const topPercent = ((clampedStart - visibleStart) / visibleDuration) * 100
                const heightPercent = ((clampedEnd - clampedStart) / visibleDuration) * 100
                const clientColor = entry.client && clientColors[entry.client] ? clientColors[entry.client] : '#2196F3'
                const textColor = getContrastColor(clientColor)
                const borderColor = adjustColorBrightness(clientColor, -30)

                return (
                  <div
                    key={entry.id}
                    className={`calendar-entry ${entry.disabled ? 'disabled' : ''}`}
                    style={{
                      top: `${topPercent}%`,
                      height: `calc(${heightPercent}% - 8px)`,
                      pointerEvents: resizingEntry && resizingEntry.id === entry.id ? 'none' : 'auto',
                      backgroundColor: clientColor,
                      color: textColor,
                      borderColor,
                      opacity: entry.disabled ? 0.5 : 1,
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      onEditEntry(entry, dateKey)
                    }}
                    onMouseEnter={() => handleEntryMouseEnter(entry)}
                    onMouseLeave={() => setHoveredTimeRange(null)}
                  >
                    <div
                      className="entry-resize-handle entry-resize-top"
                      onMouseDown={(e) => handleResizeMouseDown(e, entry, 'top', dateKey)}
                      title="Drag to adjust start time"
                      style={{ pointerEvents: 'auto', backgroundColor: borderColor }}
                    />
                    <div className="entry-client">
                      {entry.client}
                      {entry.ticket ? `-${entry.ticket}` : ''} <span style={{ fontSize: '0.85em', opacity: 0.8 }}>(time: {durationHours}h)</span>
                    </div>
                    <div className="entry-description">{entry.description}</div>
                    <button
                      className="entry-delete"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteEntry(dateKey, entry.id)
                      }}
                      style={{ color: textColor }}
                    >
                      ✕
                    </button>
                    <div
                      className="entry-resize-handle entry-resize-bottom"
                      onMouseDown={(e) => handleResizeMouseDown(e, entry, 'bottom', dateKey)}
                      title="Drag to adjust end time"
                      style={{ pointerEvents: 'auto', backgroundColor: borderColor }}
                    />
                  </div>
                )
              })}
            </div>
          )
        })}

        <div className="calendar-current-time-overlay" aria-hidden="true">
          <div
            className="calendar-current-time-overlay-content"
            style={{ height: `${overlayHeight}px` }}
          >
            <div className="calendar-current-time-line" style={{ top: currentTimeLineTop }} />
            <div
              className={`calendar-current-time-label calendar-current-time-label-${currentTimeMode}`}
              style={{ top: currentTimeMode === 'within' ? currentTimeLabelWithinTop : currentTimeLabelTop }}
              title={`Current time ${currentTimeLabel}`}
            >
              {currentTimeLabel}
            </div>
          </div>
        </div>
      </div>

      {editingEntry && (
        <div className="calendar-modal-overlay">
        <div
          className="calendar-modal"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault()
                void handleSave()
              }
          }}
        >
          <h3>{editingEntry.isNew ? 'New Entry' : 'Edit Entry'}</h3>
          <div className="modal-grid-row modal-grid-row-three">
            <div className="modal-field">
              <label>Date</label>
              <input
                type="date"
                value={editingEntryDateKey || ''}
                onChange={(e) => onEditEntry({ ...editingEntry }, e.target.value)}
                tabIndex={0}
              />
            </div>
            <div className="modal-field">
              <label>Start Time</label>
              <input
                type="time"
                value={editingEntry.startTime}
                onChange={(e) => onEditEntry({ ...editingEntry, startTime: e.target.value }, editingEntryDateKey)}
                tabIndex={1}
              />
            </div>
            <div className="modal-field">
              <label>End Time</label>
              <input
                type="time"
                value={editingEntry.endTime}
                onChange={(e) => onEditEntry({ ...editingEntry, endTime: e.target.value }, editingEntryDateKey)}
                tabIndex={2}
              />
            </div>
          </div>
          <div className="modal-grid-row modal-grid-row-three modal-grid-row-ticket">
            <div className="modal-field">
              <label>Client</label>
              <select
                value={editingEntry.client}
                onChange={(e) => onEditEntry({ ...editingEntry, client: e.target.value }, editingEntryDateKey)}
                tabIndex={3}
              >
                <option value="">Select Client</option>
                {clients.map((client) => (
                  <option key={client} value={client}>
                    {client}
                  </option>
                ))}
              </select>
            </div>
            <div className="modal-field">
              <label>Ticket #</label>
              <input
                type="text"
                value={editingEntry.ticket}
                onChange={(e) => onEditEntry({ ...editingEntry, ticket: e.target.value }, editingEntryDateKey)}
                tabIndex={4}
              />
            </div>
            <div className="modal-field">
              <label>Select ticket already logged to</label>
              <select
                value={quickTicketSelection}
                onChange={(e) => handleQuickTicketSelect(e.target.value)}
                tabIndex={5}
              >
                <option value="">Select ticket...</option>
                {latestTicketOption && (
                  <option key={latestTicketOption.key} value={latestTicketOption.key}>
                    {latestTicketOption.label}
                  </option>
                )}
                {ticketOptions.pinned.length > 0 && (
                  <optgroup label="Pinned">
                    {ticketOptions.pinned.map((option) => (
                      <option key={`pinned-${option.key}`} value={option.key}>
                        {option.friendlyName?.trim()
                          ? `${option.friendlyName.trim()} (${option.client}-${option.ticket})`
                          : `${option.client}-${option.ticket}`}
                      </option>
                    ))}
                  </optgroup>
                )}
                {ticketOptions.todos.length > 0 && (
                  <optgroup label="Todos">
                    {ticketOptions.todos.map((option) => (
                      <option key={`todo-${option.key}`} value={option.key}>
                        {option.friendlyName?.trim()
                          ? `${option.friendlyName.trim()} (${option.client}-${option.ticket})`
                          : `${option.client}-${option.ticket}`}
                      </option>
                    ))}
                  </optgroup>
                )}
                {ticketOptions.recent.length > 0 && (
                  <optgroup label="Recent 7 days">
                    {ticketOptions.recent.map((option) => (
                      <option key={`recent-${option.key}`} value={option.key}>
                        {option.friendlyName?.trim()
                          ? `${option.friendlyName.trim()} (${option.client}-${option.ticket})`
                          : `${option.client}-${option.ticket}`}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          </div>
            <div className="modal-field">
              <label>Description</label>
              <textarea
                ref={descriptionRef}
                value={editingEntry.description}
                onChange={(e) => onEditEntry({ ...editingEntry, description: e.target.value }, editingEntryDateKey)}
                onInput={(e) => resizeDescriptionTextarea(e.currentTarget)}
                rows={1}
                style={{ overflow: 'hidden' }}
                tabIndex={6}
              />
            </div>
            <div className="modal-field">
              <label>Tags</label>
              <select
                multiple
                value={normalizedSelectedTags}
                onChange={handleTagSelectionChange}
                tabIndex={7}
                size={Math.max(4, Math.min(availableTagTypes.length || 0, 8))}
                disabled={availableTagTypes.length === 0}
              >
                {availableTagTypes.length > 0 ? (
                  availableTagTypes.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))
                ) : (
                  <option value="" disabled>
                    No tag types configured
                  </option>
                )}
              </select>
              <div className="modal-helper-text">
                Hold Ctrl or Cmd to choose multiple tags.
              </div>
            </div>
            <div className="modal-field modal-field-checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={editingEntry.disabled || false}
                  disabled={isEntryUntracked?.(editingEntry)}
                  onChange={(e) => {
                    if (isEntryUntracked?.(editingEntry) && e.target.checked) return
                    onEditEntry({ ...editingEntry, disabled: e.target.checked }, editingEntryDateKey)
                  }}
                  tabIndex={8}
                />
                Logged
              </label>
            </div>
            <div className="modal-buttons">
              {editingEntry.isNew ? (
                <button className="btn-cancel" onClick={() => setShowCloseConfirm(true)} tabIndex={10}>
                  Discard
                </button>
              ) : (
                <button className="btn-cancel" onClick={() => onEditEntry(null, null)} tabIndex={10}>
                  Cancel
                </button>
              )}
              <button className="btn-save" onClick={() => void handleSave()} tabIndex={9}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showCloseConfirm && (
        <div className="calendar-modal-overlay" onClick={() => setShowCloseConfirm(false)}>
          <div className="calendar-modal" style={{ maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
            <h3>Discard Entry?</h3>
            <p>Are you sure you want to discard this new entry? This action cannot be undone.</p>
            <div className="modal-buttons">
              <button className="btn-cancel" onClick={() => setShowCloseConfirm(false)}>
                Cancel
              </button>
              <button className="btn-save" onClick={handleDiscardNewEntry}>
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CalendarView
