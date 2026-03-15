import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Sun, SunDim } from 'lucide-react'
import type { Role } from '../../types/app'
import { useSessionNotes } from './useSessionNotes'

type CalendarTabProps = {
  campaignId: string
  role: Role | null
}

type AggregatedDay = {
  key: string
  dayNumber: number
  label: string
  dayComplete: boolean
  events: { text: string; sessionNumber: number | null }[]
}

function extractDayNumber(key: string): number {
  const match = key.match(/(\d+)/)
  return match ? parseInt(match[1], 10) : 0
}

export function CalendarTab({ campaignId }: CalendarTabProps) {
  const { notes, notesLoading } = useSessionNotes(campaignId)
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set())

  const days = useMemo(() => {
    const dayMap = new Map<string, AggregatedDay>()

    for (const note of notes) {
      for (const entry of note.calendar) {
        const existing = dayMap.get(entry.key)
        const events = entry.entries.map((text) => ({
          text,
          sessionNumber: note.sessionNumber,
        }))

        if (existing) {
          existing.events.push(...events)
          if (entry.dayComplete) existing.dayComplete = true
          if (entry.label && !existing.label) existing.label = entry.label
        } else {
          dayMap.set(entry.key, {
            key: entry.key,
            dayNumber: extractDayNumber(entry.key),
            label: entry.label,
            dayComplete: entry.dayComplete,
            events,
          })
        }
      }
    }

    return Array.from(dayMap.values()).sort((a, b) => b.dayNumber - a.dayNumber || b.key.localeCompare(a.key))
  }, [notes])

  const toggleDay = (key: string) => {
    setCollapsedDays((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="calendar-tab">
      <h2 className="calendar-tab-title">Chronicle of Days</h2>

      {notesLoading ? (
        <p className="map-npc-scene-empty">Loading...</p>
      ) : days.length === 0 ? (
        <p className="calendar-empty">No days have been recorded yet.</p>
      ) : (
        <div className="calendar-day-list">
          {days.map((day) => {
            const collapsed = collapsedDays.has(day.key)
            return (
              <div key={day.key} className={`calendar-day-card${day.dayComplete ? '' : ' calendar-day-ongoing'}`}>
                <button
                  type="button"
                  className="calendar-day-header"
                  onClick={() => toggleDay(day.key)}
                >
                  {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                  <span className="calendar-day-icon">
                    {day.dayComplete ? <Sun size={16} /> : <SunDim size={16} />}
                  </span>
                  <span className="calendar-day-label">
                    <strong>Day {day.dayNumber}</strong>
                    {day.label ? <span className="calendar-day-desc">{day.label}</span> : null}
                    {!day.dayComplete ? <em className="calendar-day-status">in progress</em> : null}
                  </span>
                </button>
                {!collapsed && day.events.length > 0 ? (
                  <ul className="calendar-day-events">
                    {day.events.map((event, i) => (
                      <li key={i}>
                        <span className="calendar-event-text">{event.text}</span>
                        {event.sessionNumber != null ? (
                          <span className="calendar-event-source">Session {event.sessionNumber}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
