import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { nanoid } from 'nanoid'
import { ChevronDown, ChevronLeft, Calendar, Cloud, Compass, LayoutList, Link2, LogOut, MapPin, Printer, StickyNote, Clock, UserPlus } from 'lucide-react'
import {
  DndContext, PointerSensor, useSensor, useSensors,
  type DragEndEvent, closestCenter,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/hooks/useAuth'
import DayTabs from '@/components/DayTabs'
import ActivityCard from '@/components/ActivityCard'
import ActivityEditModal from '@/components/ActivityEditModal'
import PlacesAutocomplete from '@/components/PlacesAutocomplete'
import TripMap from '@/components/TripMap'
import TimelineView from '@/components/TimelineView'
import NearbyDrawer from '@/components/NearbyDrawer'
import WeatherWidget from '@/components/WeatherWidget'
import { subscribeTrip, subscribeDays, addDay, removeDay, addActivity, deleteTrip, updateTrip, updateDayNotes, reorderActivities } from '@/lib/firestore/trips'
import type { Trip, Day, Activity, POI } from '@/lib/types'
import { todayISO, addDaysISO, formatDateISO, formatMoney, exportIcal } from '@/lib/utils'

function SectionHeader({
  title, open, onToggle, badge, icon,
}: {
  title: string
  open: boolean
  onToggle: () => void
  badge?: string | number
  icon?: React.ReactNode
}) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center justify-between rounded py-1.5 text-left hover:text-slate-900"
    >
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-xs font-semibold text-slate-700">{title}</span>
        {badge != null && (
          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{badge}</span>
        )}
      </div>
      <ChevronDown
        className={`h-3.5 w-3.5 flex-shrink-0 text-slate-400 transition-transform duration-150 ${open ? '' : '-rotate-90'}`}
      />
    </button>
  )
}

export default function TripDetail() {
  const { tripId } = useParams<{ tripId: string }>()
  const nav = useNavigate()
  const { user, signOut } = useAuth()
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
  const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list')
  const [nearbyOpen, setNearbyOpen] = useState(false)
  const [mobileTab, setMobileTab] = useState<'list' | 'map'>('list')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteBusy, setInviteBusy] = useState(false)
  const [weatherVisible, setWeatherVisible] = useState(true)
  const [activitiesOpen, setActivitiesOpen] = useState(true)
  const [budgetOpen, setBudgetOpen] = useState(true)
  const [checklistOpen, setChecklistOpen] = useState(true)

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
  const selectedPOI = useMemo(
    () => localActivities.find((a) => a.id === selectedActivityId)?.poi ?? null,
    [localActivities, selectedActivityId],
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

  const handleAddNote = async () => {
    if (!tripId || !selectedDay) return
    const activity: Activity = {
      id: nanoid(8),
      order: selectedDay.activities.length,
      type: 'note',
      title: 'Note',
      notes: '',
    }
    try {
      await addActivity(tripId, selectedDay, activity)
      setEditingActivityId(activity.id)
    } catch (e) {
      console.error(e); toast.error('Failed to add note')
    }
  }

  const handleAddTransport = async () => {
    if (!tripId || !selectedDay) return
    const activity: Activity = {
      id: nanoid(8),
      order: selectedDay.activities.length,
      type: 'transport',
      title: 'Transport',
    }
    try {
      await addActivity(tripId, selectedDay, activity)
      setEditingActivityId(activity.id)
    } catch (e) {
      console.error(e); toast.error('Failed to add transport')
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

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!trip || !tripId) return
    const email = inviteEmail.trim().toLowerCase()
    if (!email) return
    setInviteBusy(true)
    try {
      const q = query(collection(db, 'users'), where('email', '==', email))
      const snap = await getDocs(q)
      if (snap.empty) {
        toast.error('No user found with that email')
        setInviteBusy(false)
        return
      }
      const uid = snap.docs[0].id
      if (trip.memberIds.includes(uid)) {
        toast('This person is already a member')
        setInviteBusy(false)
        return
      }
      await updateTrip(tripId, { memberIds: [...trip.memberIds, uid] })
      toast.success('Member added!')
      setInviteEmail('')
      setInviteOpen(false)
    } catch (e) {
      toast.error('Invite failed')
      console.error(e)
    } finally {
      setInviteBusy(false)
    }
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Combined app + trip header */}
      <div className="border-b border-slate-200 bg-white print:hidden">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2.5">
          {/* Logo + back */}
          <Link to="/trips" className="flex-shrink-0 text-sky-600" title="All trips">
            <Compass className="h-5 w-5" />
          </Link>
          <button
            onClick={() => nav('/trips')}
            className="flex flex-shrink-0 items-center gap-0.5 text-sm text-slate-500 hover:text-slate-900"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Trips</span>
          </button>
          <div className="mx-1 hidden h-5 w-px flex-shrink-0 bg-slate-200 sm:block" />

          {/* Trip info */}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold leading-tight">{trip.title}</h1>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              {trip.destination && (
                <>
                  <MapPin className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">{trip.destination.name}</span>
                </>
              )}
              {trip.startDate && (
                <span className="hidden sm:inline">
                  {trip.destination && '·'} {formatDateISO(trip.startDate)}{trip.endDate ? ` – ${formatDateISO(trip.endDate)}` : ''}
                </span>
              )}
            </div>
          </div>

          {/* Actions + user */}
          <div className="flex flex-shrink-0 items-center gap-0.5">
            {trip.destination && (
              <button
                onClick={() => setWeatherVisible((v) => !v)}
                title={weatherVisible ? 'Hide weather' : 'Show weather'}
                className={`rounded p-1.5 transition ${weatherVisible ? 'text-sky-500 hover:bg-sky-50' : 'text-slate-400 hover:bg-slate-100'}`}
              >
                <Cloud className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={handleShareTrip}
              className="hidden items-center gap-1 rounded px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-sky-600 sm:flex"
              title="Copy share link"
            >
              <Link2 className="h-4 w-4" />
              <span className="hidden lg:inline">Share</span>
            </button>
            <button
              onClick={() => setInviteOpen(true)}
              className="hidden items-center gap-1 rounded px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-sky-600 sm:flex"
              title="Invite member"
            >
              <UserPlus className="h-4 w-4" />
              <span className="hidden lg:inline">Invite</span>
            </button>
            <button
              onClick={() => window.print()}
              className="hidden items-center gap-1 rounded px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-sky-600 sm:flex"
              title="Print / Save as PDF"
            >
              <Printer className="h-4 w-4" />
              <span className="hidden lg:inline">Print</span>
            </button>
            <button
              onClick={() => exportIcal(trip.title, days)}
              className="hidden items-center gap-1 rounded px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-sky-600 sm:flex"
              title="Export iCal"
            >
              <Calendar className="h-4 w-4" />
              <span className="hidden lg:inline">iCal</span>
            </button>
            <button
              onClick={handleDeleteTrip}
              className="hidden rounded px-2 py-1.5 text-sm text-red-600 hover:bg-red-50 sm:block"
            >
              Delete
            </button>
            <div className="mx-1 hidden h-4 w-px bg-slate-200 sm:block" />
            <Link
              to="/profile"
              className="hidden max-w-[100px] truncate rounded px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 sm:block"
              title="Profile"
            >
              {user?.displayName ?? user?.email}
            </Link>
            <button
              onClick={() => signOut()}
              className="hidden items-center rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 sm:flex"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
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
          <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
            <div className="flex-1 sm:w-72">
              <PlacesAutocomplete onSelect={handleAddPOI} placeholder="Search to add a stop…" />
            </div>
            <button
              onClick={handleAddNote}
              className="flex-shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
              title="Add note"
            >
              + Note
            </button>
            <button
              onClick={handleAddTransport}
              className="flex-shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
              title="Add transport"
            >
              + Transport
            </button>
          </div>
        </div>
      </div>

      {/* Weather strip */}
      {trip.destination && weatherVisible && (
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-2">
          <div className="mx-auto max-w-7xl">
            <WeatherWidget lat={trip.destination.lat} lng={trip.destination.lng} />
          </div>
        </div>
      )}

      <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-[minmax(360px,40%)_1fr]">
        <aside className={`print-area overflow-y-auto border-r border-slate-200 bg-slate-50 p-4 ${mobileTab === 'list' ? 'block' : 'hidden md:block'}`}>
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
              <SectionHeader
                title="Stops"
                open={activitiesOpen}
                onToggle={() => setActivitiesOpen((o) => !o)}
                badge={localActivities.length}
              />
              {activitiesOpen && <>{/* View mode toggle */}
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">{localActivities.length} {localActivities.length === 1 ? 'stop' : 'stops'}</span>
                <div className="flex items-center gap-2">
                  {selectedPOI && (
                    <button
                      onClick={() => setNearbyOpen((o) => !o)}
                      className="print-hide rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                      title="Discover nearby places"
                    >
                      {nearbyOpen ? 'Hide nearby' : '🔍 Nearby'}
                    </button>
                  )}
                  <div className="flex rounded-lg border border-slate-200 bg-white text-xs">
                    <button
                      onClick={() => setViewMode('list')}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-l-lg transition ${viewMode === 'list' ? 'bg-sky-50 text-sky-700' : 'text-slate-500 hover:bg-slate-50'}`}
                      title="List view"
                    >
                      <LayoutList className="h-3.5 w-3.5" /> List
                    </button>
                    <button
                      onClick={() => setViewMode('timeline')}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-r-lg border-l border-slate-200 transition ${viewMode === 'timeline' ? 'bg-sky-50 text-sky-700' : 'text-slate-500 hover:bg-slate-50'}`}
                      title="Timeline view"
                    >
                      <Clock className="h-3.5 w-3.5" /> Timeline
                    </button>
                  </div>
                </div>
              </div>

              {/* Nearby suggestions drawer */}
              {nearbyOpen && selectedPOI && (
                <NearbyDrawer
                  center={{ lat: selectedPOI.lat, lng: selectedPOI.lng }}
                  onAdd={(poi) => { handleAddPOI(poi); setNearbyOpen(false) }}
                  onClose={() => setNearbyOpen(false)}
                />
              )}

              {viewMode === 'timeline' ? (
                <TimelineView
                  activities={localActivities}
                  selectedId={selectedActivityId}
                  onSelect={(id) => { setSelectedActivityId(id); setEditingActivityId(id) }}
                />
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
              </>}
            </>
          )}

          {selectedDay && (
            <div className="mt-4">
              <SectionHeader
                title="Day notes"
                open={notesOpen}
                onToggle={() => setNotesOpen((o) => !o)}
                badge={!notesOpen && dayNotesValue ? '✓' : undefined}
                icon={<StickyNote className="h-3.5 w-3.5 text-slate-400" />}
              />
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
              <div className="mt-4">
                <SectionHeader title="Budget" open={budgetOpen} onToggle={() => setBudgetOpen((o) => !o)} badge={tripTotal > 0 ? formatMoney(tripTotal, currency) : undefined} />
              {budgetOpen && <div className="mt-2 rounded-lg border border-slate-200 bg-white p-3 text-xs">
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
              </div>}
              </div>
            )
          })()}

          {/* Checklist */}
          {trip && (() => {
            const checklist = trip.checklist ?? []
            const doneCount = checklist.filter((i) => i.done).length
            return (
              <div className="mt-4">
                <SectionHeader
                  title="Checklist"
                  open={checklistOpen}
                  onToggle={() => setChecklistOpen((o) => !o)}
                  badge={checklist.length > 0 ? `${doneCount}/${checklist.length}` : undefined}
                />
              {checklistOpen && <div className="mt-2 rounded-lg border border-slate-200 bg-white p-3">
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
              </div>}
              </div>
            )
          })()}
        </aside>

        <section className={`relative ${mobileTab === 'map' ? 'block' : 'hidden md:block'}`}>
          <TripMap
            activities={selectedDay?.activities ?? []}
            selectedId={selectedActivityId ?? undefined}
            onSelectActivity={(id) => { setSelectedActivityId(id); setEditingActivityId(id) }}
            fallbackCenter={trip.destination ? { lat: trip.destination.lat, lng: trip.destination.lng } : undefined}
          />
        </section>
      </div>

      {/* Mobile bottom tab bar */}
      <nav className="print-hide fixed bottom-0 left-0 right-0 z-30 flex border-t border-slate-200 bg-white md:hidden">
        <button
          onClick={() => setMobileTab('list')}
          className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${mobileTab === 'list' ? 'text-sky-600' : 'text-slate-500'}`}
        >
          <LayoutList className="h-5 w-5" />
          List
        </button>
        <button
          onClick={() => setMobileTab('map')}
          className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${mobileTab === 'map' ? 'text-sky-600' : 'text-slate-500'}`}
        >
          <MapPin className="h-5 w-5" />
          Map
        </button>
      </nav>

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

      {/* Invite member modal */}
      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Invite member</h2>
            <p className="mt-1 text-sm text-slate-500">Enter the email of a registered user to give them access to this trip.</p>
            <form onSubmit={handleInvite} className="mt-4 space-y-3">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="email@example.com"
                className="input"
                autoFocus
                required
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setInviteOpen(false); setInviteEmail('') }}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviteBusy}
                  className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  {inviteBusy ? 'Inviting…' : 'Invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
