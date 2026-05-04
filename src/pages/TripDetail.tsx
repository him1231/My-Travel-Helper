import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { nanoid } from 'nanoid'
import { ChevronLeft, Link2, MapPin, StickyNote } from 'lucide-react'
import {
  DndContext, PointerSensor, useSensor, useSensors,
  type DragEndEvent, closestCenter,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import Header from '@/components/Header'
import DayTabs from '@/components/DayTabs'
import ActivityCard from '@/components/ActivityCard'
import ActivityEditModal from '@/components/ActivityEditModal'
import PlacesAutocomplete from '@/components/PlacesAutocomplete'
import TripMap from '@/components/TripMap'
import { subscribeTrip, subscribeDays, addDay, removeDay, addActivity, deleteTrip, updateTrip, updateDayNotes, reorderActivities } from '@/lib/firestore/trips'
import type { Trip, Day, Activity, POI } from '@/lib/types'
import { todayISO, addDaysISO, formatDateISO, formatMoney } from '@/lib/utils'

export default function TripDetail() {
  const { tripId } = useParams<{ tripId: string }>()
  const nav = useNavigate()
  const [trip, setTrip] = useState<Trip | null>(null)
  const [days, setDays] = useState<Day[]>([])
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null)
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null)
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [dayNotesValue, setDayNotesValue] = useState('')
  const [notesOpen, setNotesOpen] = useState(false)
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Optimistic local copy of activities for smooth DnD
  const [localActivities, setLocalActivities] = useState<Activity[]>([])
  const [categoryFilter, setCategoryFilter] = useState<string>('')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  useEffect(() => {
    if (!tripId) return
    const unsubT = subscribeTrip(tripId, (t) => {
      if (!t) setMissing(true)
      else setTrip(t)
      setLoading(false)
    })
    const unsubD = subscribeDays(tripId, (d) => setDays(d))
    return () => { unsubT(); unsubD() }
  }, [tripId])

  useEffect(() => {
    if (days.length === 0) {
      if (selectedDayId !== null) setSelectedDayId(null)
      return
    }
    if (!selectedDayId || !days.find((d) => d.id === selectedDayId)) {
      setSelectedDayId(days[0].id)
    }
  }, [days, selectedDayId])

  const selectedDay = useMemo(
    () => days.find((d) => d.id === selectedDayId) ?? null,
    [days, selectedDayId],
  )
  const editingActivity = useMemo(
    () => localActivities.find((a) => a.id === editingActivityId) ?? null,
    [localActivities, editingActivityId],
  )

  // Sync local notes state when selected day changes
  useEffect(() => {
    setDayNotesValue(selectedDay?.notes ?? '')
  }, [selectedDayId, selectedDay?.notes])

  // Keep local activities in sync with Firestore (but don't override during active drag)
  useEffect(() => {
    setLocalActivities(selectedDay?.activities ?? [])
  }, [selectedDay?.activities])

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id || !selectedDay || !tripId) return
    const oldIds = localActivities.map((a) => a.id)
    const oldIdx = oldIds.indexOf(active.id as string)
    const newIdx = oldIds.indexOf(over.id as string)
    const reordered = arrayMove(localActivities, oldIdx, newIdx)
    setLocalActivities(reordered) // optimistic update
    try {
      await reorderActivities(tripId, selectedDay, reordered.map((a) => a.id))
    } catch (e) {
      console.error(e)
      toast.error('Failed to reorder')
      setLocalActivities(selectedDay.activities) // rollback
    }
  }

  if (loading) return <div className="grid h-screen place-items-center text-slate-500">Loading…</div>
  if (missing || !trip || !tripId) {
    return (
      <div className="grid h-screen place-items-center text-slate-500">
        <div className="text-center">
          <p>Trip not found.</p>
          <button onClick={() => nav('/trips')} className="mt-3 text-sky-600 hover:underline">Back to trips</button>
        </div>
      </div>
    )
  }

  const handleAddDay = async () => {
    const lastDate = days[days.length - 1]?.date
    const nextDate = lastDate ? addDaysISO(lastDate, 1) : (trip.startDate ?? todayISO())
    try {
      await addDay(tripId, nextDate)
      setSelectedDayId(nextDate)
    } catch (e) {
      console.error(e)
      toast.error('Failed to add day')
    }
  }

  const handleRemoveDay = async (dayId: string) => {
    const day = days.find((d) => d.id === dayId)
    const actCount = day?.activities.length ?? 0
    const msg = actCount > 0
      ? `Remove this day and its ${actCount} activit${actCount === 1 ? 'y' : 'ies'}?`
      : 'Remove this day?'
    if (!confirm(msg)) return
    try {
      await removeDay(tripId, dayId)
      if (selectedDayId === dayId) {
        const remaining = days.filter((d) => d.id !== dayId)
        setSelectedDayId(remaining[0]?.id ?? null)
      }
    } catch (e) {
      console.error(e)
      toast.error('Failed to remove day')
    }
  }

  const handleAddPOI = async (poi: POI) => {
    let day = selectedDay
    if (!day) {
      const date = trip.startDate ?? todayISO()
      try {
        await addDay(tripId, date)
      } catch (e) {
        console.error(e); toast.error('Failed to add stop'); return
      }
      day = { id: date, date, notes: '', activities: [] }
      setSelectedDayId(date)
    }
    const activity: Activity = {
      id: nanoid(8),
      order: day.activities.length,
      type: 'poi',
      title: poi.name,
      poi,
    }
    try {
      await addActivity(tripId, day, activity)
      setSelectedActivityId(activity.id)
    } catch (e) {
      console.error(e); toast.error('Failed to add stop')
    }
  }

  const handleDayNotesChange = (value: string) => {
    setDayNotesValue(value)
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current)
    notesTimerRef.current = setTimeout(async () => {
      if (!tripId || !selectedDayId) return
      try {
        await updateDayNotes(tripId, selectedDayId, value)
      } catch (e) {
        console.error(e)
      }
    }, 600)
  }

  const handleShareTrip = async () => {
    if (!trip || !tripId) return
    let token = trip.shareToken
    if (!token) {
      token = nanoid(12)
      try {
        await updateTrip(tripId, { shareToken: token })
      } catch (e) {
        toast.error('Could not generate share link'); return
      }
    }
    const url = `${window.location.origin}${window.location.pathname.replace(/\/trips.*/, '')}#/shared/${token}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Share link copied to clipboard!')
    } catch {
      toast.error(`Share link: ${url}`)
    }
  }

  const handleDeleteTrip = async () => {
    if (!confirm('Delete this trip permanently?')) return
    try {
      await deleteTrip(tripId)
      nav('/trips')
    } catch (e) {
      toast.error('Delete failed'); console.error(e)
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <Header />

      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <button onClick={() => nav('/trips')} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
              <ChevronLeft className="h-4 w-4" />
              Trips
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold">{trip.title}</h1>
              {trip.description && (
                <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{trip.description}</p>
              )}
              <div className="flex items-center gap-2 text-xs text-slate-500">
                {trip.destination && (
                  <>
                    <MapPin className="h-3 w-3" />
                    <span className="truncate">{trip.destination.name}</span>
                    {trip.startDate && <span>·</span>}
                  </>
                )}
                {trip.startDate && (
                  <span>{formatDateISO(trip.startDate)}{trip.endDate ? ` – ${formatDateISO(trip.endDate)}` : ''}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleShareTrip}
              className="flex items-center gap-1 text-sm text-slate-600 hover:text-sky-600"
              title="Copy share link"
            >
              <Link2 className="h-4 w-4" />
              Share
            </button>
            <button onClick={handleDeleteTrip} className="text-sm text-red-600 hover:underline">Delete trip</button>
          </div>
        </div>
      </div>

      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-3">
          <DayTabs
            days={days}
            selectedId={selectedDayId}
            onSelect={setSelectedDayId}
            onAddDay={handleAddDay}
            onRemoveDay={handleRemoveDay}
          />
          <div className="ml-auto w-full sm:w-72">
            <PlacesAutocomplete onSelect={handleAddPOI} placeholder="Search to add a stop…" />
          </div>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-[minmax(360px,40%)_1fr]">
        <aside className="overflow-y-auto border-r border-slate-200 bg-slate-50 p-4">
          {!selectedDay ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
              <p>No days yet — click “Add day” to start.</p>
            </div>
          ) : selectedDay.activities.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
              <p>No stops yet.</p>
              <p className="mt-1 text-xs">Use the search box above to add a place.</p>
            </div>
          ) : (
            <>
              {/* Category filter pills */}
              {localActivities.some((a) => a.poi?.category) && (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {[
                    { value: '', label: 'All', emoji: '' },
                    { value: 'sight', label: 'Sights', emoji: '🏛️' },
                    { value: 'food', label: 'Food', emoji: '🍽️' },
                    { value: 'hotel', label: 'Hotel', emoji: '🏨' },
                    { value: 'transport', label: 'Transport', emoji: '🚌' },
                    { value: 'other', label: 'Other', emoji: '📌' },
                  ].map((c) => (
                    <button
                      key={c.value}
                      onClick={() => setCategoryFilter(c.value)}
                      className={`rounded-full border px-2.5 py-0.5 text-xs transition ${
                        categoryFilter === c.value
                          ? 'border-sky-500 bg-sky-50 text-sky-700'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {c.emoji ? `${c.emoji} ` : ''}{c.label}
                    </button>
                  ))}
                </div>
              )}
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={localActivities.map((a) => a.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {(categoryFilter
                    ? localActivities.filter((a) => a.poi?.category === categoryFilter)
                    : localActivities
                  ).map((a, i) => (
                    <ActivityCard
                      key={a.id}
                      activity={a}
                      index={i}
                      selected={selectedActivityId === a.id}
                      onSelect={() => { setSelectedActivityId(a.id); setEditingActivityId(a.id) }}
                    />
                  ))}
                </div>
              </SortableContext>
              </DndContext>
            </>
          )}

          {selectedDay && (
            <div className="mt-4">
              <button
                onClick={() => setNotesOpen((o) => !o)}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900"
              >
                <StickyNote className="h-3.5 w-3.5" />
                {notesOpen ? 'Hide day notes' : 'Day notes'}
                {!notesOpen && dayNotesValue && (
                  <span className="ml-1 rounded-full bg-sky-100 px-1.5 py-0.5 text-sky-700">&#10003;</span>
                )}
              </button>
              {notesOpen && (
                <textarea
                  value={dayNotesValue}
                  onChange={(e) => handleDayNotesChange(e.target.value)}
                  rows={4}
                  placeholder="Notes for this day…"
                  className="input mt-2"
                />
              )}
            </div>
          )}
        {/* Budget summary */}
          {days.length > 0 && (() => {
            const currency = trip.currency || 'USD'
            const allActivities = days.flatMap((d) => d.activities)
            const tripTotal = allActivities.reduce((sum, a) => sum + (a.cost?.amount ?? 0), 0)
            const dayTotal = (selectedDay?.activities ?? []).reduce((sum, a) => sum + (a.cost?.amount ?? 0), 0)
            const budgetLimit = trip.budgetLimit?.amount
            const hasAny = tripTotal > 0 || budgetLimit
            if (!hasAny) return null
            const overBudget = budgetLimit && tripTotal > budgetLimit
            const pct = budgetLimit ? Math.min(100, (tripTotal / budgetLimit) * 100) : 0
            return (
              <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3 text-xs">
                <div className="mb-2 font-semibold text-slate-700">Budget summary</div>
                {(selectedDay?.activities ?? []).filter((a) => (a.cost?.amount ?? 0) > 0).map((a) => (
                  <div key={a.id} className="flex justify-between py-0.5 text-slate-600">
                    <span className="truncate pr-2">{a.title}</span>
                    <span className="flex-shrink-0 font-medium">{formatMoney(a.cost!.amount, a.cost!.currency || currency)}</span>
                  </div>
                ))}
                {selectedDay && dayTotal > 0 && (
                  <div className="mt-1 flex justify-between border-t border-slate-100 pt-1 font-semibold text-slate-700">
                    <span>Day total</span>
                    <span>{formatMoney(dayTotal, currency)}</span>
                  </div>
                )}
                <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 font-bold text-slate-900">
                  <span>Trip total</span>
                  <span className={overBudget ? 'text-red-600' : ''}>{formatMoney(tripTotal, currency)}</span>
                </div>
                {budgetLimit != null && (
                  <>
                    <div className="mt-1 flex justify-between text-slate-500">
                      <span>Budget limit</span>
                      <span>{formatMoney(budgetLimit, currency)}</span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full transition-all ${overBudget ? 'bg-red-500' : 'bg-emerald-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </>
                )}
              </div>
            )
          })()}

          {/* Checklist */}
          {trip && (() => {
            const checklist = trip.checklist ?? []
            const doneCount = checklist.filter((i) => i.done).length
            return (
              <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">
                    Checklist {checklist.length > 0 && <span className="ml-1 text-slate-400">({doneCount}/{checklist.length})</span>}
                  </span>
                </div>
                <div className="space-y-1">
                  {checklist.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 group">
                      <input
                        type="checkbox"
                        checked={item.done}
                        onChange={async () => {
                          const updated = checklist.map((c) => c.id === item.id ? { ...c, done: !c.done } : c)
                          try { await updateTrip(tripId!, { checklist: updated }) } catch (e) { console.error(e) }
                        }}
                        className="h-3.5 w-3.5 rounded accent-sky-600 cursor-pointer"
                      />
                      <span className={`flex-1 text-xs ${item.done ? 'line-through text-slate-400' : 'text-slate-700'}`}>{item.text}</span>
                      <button
                        onClick={async () => {
                          const updated = checklist.filter((c) => c.id !== item.id)
                          try { await updateTrip(tripId!, { checklist: updated }) } catch (e) { console.error(e) }
                        }}
                        className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition text-xs"
                        aria-label="Remove item"
                      >✕</button>
                    </div>
                  ))}
                </div>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault()
                    const input = (e.currentTarget.elements.namedItem('newItem') as HTMLInputElement)
                    const text = input.value.trim()
                    if (!text) return
                    const updated = [...checklist, { id: nanoid(8), text, done: false }]
                    try { await updateTrip(tripId!, { checklist: updated }); input.value = '' } catch (err) { console.error(err) }
                  }}
                  className="mt-2 flex gap-2"
                >
                  <input name="newItem" placeholder="Add item…" className="input flex-1 py-1 text-xs" />
                  <button type="submit" className="rounded-lg bg-sky-600 px-2 py-1 text-xs font-medium text-white hover:bg-sky-700">Add</button>
                </form>
              </div>
            )
          })()}
        </aside>

        <section className="relative">
          <TripMap
            activities={selectedDay?.activities ?? []}
            selectedId={selectedActivityId ?? undefined}
            onSelectActivity={(id) => { setSelectedActivityId(id); setEditingActivityId(id) }}
            fallbackCenter={trip.destination ? { lat: trip.destination.lat, lng: trip.destination.lng } : undefined}
          />
        </section>
      </div>

      {selectedDay && (
        <ActivityEditModal
          open={!!editingActivity}
          onClose={() => setEditingActivityId(null)}
          tripId={tripId}
          day={selectedDay}
          activity={editingActivity}
          currency={trip.currency}
        />
      )}
    </div>
  )
}
