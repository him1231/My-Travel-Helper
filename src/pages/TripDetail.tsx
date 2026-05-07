import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { nanoid } from 'nanoid'
import { ChevronDown, ChevronLeft, Calendar, Cloud, Compass, LayoutGrid, LayoutList, Link2, LogOut, Map as MapIcon, MapPin, Plus, Printer, StickyNote, Clock, UserPlus, X } from 'lucide-react'
import type { DayTabConfig } from '@/components/DayTabs'
import { DEFAULT_DAY_TAB_CONFIG } from '@/components/DayTabs'
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
import OverviewView from '@/components/OverviewView'
import PlacesAutocomplete from '@/components/PlacesAutocomplete'
import TripMap from '@/components/TripMap'
import TimelineView from '@/components/TimelineView'
import NearbyDrawer from '@/components/NearbyDrawer'
import WeatherWidget from '@/components/WeatherWidget'
import { subscribeTrip, subscribeDays, addDay, removeDay, addActivity, deleteTrip, updateTrip, updateDayNotes, updateDayTitle, reorderActivities, reorderListActivities, reassignDayDates, updateActivity, removeActivity, moveActivityBetweenDays, subscribeScratchLists, addScratchList, renameScratchList, removeScratchList, addActivityToList, updateActivityInList, removeActivityFromList, moveBetweenDayAndList, moveFromListToDay, moveBetweenLists } from '@/lib/firestore/trips'
import type { Trip, Day, Activity, POI, ScratchList } from '@/lib/types'
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
  const [weatherVisible, setWeatherVisible] = useState(false)
  const [activitiesOpen, setActivitiesOpen] = useState(true)
  const [budgetOpen, setBudgetOpen] = useState(true)
  const [checklistOpen, setChecklistOpen] = useState(true)
  const [showOverview, setShowOverview] = useState(false)
  const [overviewInitialView, setOverviewInitialView] = useState<'kanban' | 'map'>('kanban')
  const fetchingRoutesRef = useRef<Set<string>>(new Set())
  const [scratchLists, setScratchLists] = useState<ScratchList[]>([])
  const [activeTabKind, setActiveTabKind] = useState<'day' | 'list'>('day')
  const [selectedListId, setSelectedListId] = useState<string | null>(null)
  const [listNameValue, setListNameValue] = useState('')
  const [dayTitleValue, setDayTitleValue] = useState('')
  const dayTitleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [dayTabConfig, setDayTabConfig] = useState<DayTabConfig>(() => {
    try {
      const stored = localStorage.getItem('dayTabConfig')
      return stored ? { ...DEFAULT_DAY_TAB_CONFIG, ...JSON.parse(stored) } : DEFAULT_DAY_TAB_CONFIG
    } catch { return DEFAULT_DAY_TAB_CONFIG }
  })

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
    const unsubL = subscribeScratchLists(tripId, setScratchLists)
    return () => { unsubT(); unsubD(); unsubL() }
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

  // Hotel banners: derive check-in/check-out activities from adjacent days
  const { checkInActivity, checkOutActivity } = useMemo(() => {
    if (!selectedDayId) return { checkInActivity: null, checkOutActivity: null }
    const idx = days.findIndex((d) => d.id === selectedDayId)
    const prevDay = idx > 0 ? days[idx - 1] : null
    const checkIn = days[idx]?.activities.find(
      (a) => a.poi?.category === 'hotel' && a.hotelCheckIn === selectedDayId,
    ) ?? null
    const checkOut = prevDay?.activities.find(
      (a) => a.poi?.category === 'hotel' && a.hotelCheckIn === prevDay.id,
    ) ?? null
    return { checkInActivity: checkIn, checkOutActivity: checkOut }
  }, [days, selectedDayId])

  const editingActivity = useMemo(() => {
    if (!editingActivityId) return null
    for (const d of days) {
      const found = d.activities.find((a) => a.id === editingActivityId)
      if (found) return found
    }
    for (const l of scratchLists) {
      const found = l.activities.find((a) => a.id === editingActivityId)
      if (found) return found
    }
    return null
  }, [days, scratchLists, editingActivityId])

  const editingDay = useMemo(
    () => (editingActivityId ? days.find((d) => d.activities.some((a) => a.id === editingActivityId)) ?? null : null),
    [days, editingActivityId],
  )

  const editingList = useMemo(
    () => (editingActivityId ? scratchLists.find((l) => l.activities.some((a) => a.id === editingActivityId)) ?? null : null),
    [scratchLists, editingActivityId],
  )

  const selectedList = useMemo(
    () => (activeTabKind === 'list' ? scratchLists.find((l) => l.id === selectedListId) ?? null : null),
    [activeTabKind, selectedListId, scratchLists],
  )
  const selectedPOI = useMemo(
    () => localActivities.find((a) => a.id === selectedActivityId)?.poi ?? null,
    [localActivities, selectedActivityId],
  )

  // Sync local notes/title state when selected day changes
  useEffect(() => {
    setDayNotesValue(selectedDay?.notes ?? '')
    setDayTitleValue(selectedDay?.title ?? '')
  }, [selectedDayId, selectedDay?.notes, selectedDay?.title])

  // Sync list name input when selected list changes
  useEffect(() => {
    setListNameValue(selectedList?.name ?? '')
  }, [selectedList?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep local activities in sync with Firestore (but don't override during active drag)
  useEffect(() => {
    if (activeTabKind !== 'day') return
    setLocalActivities(selectedDay?.activities ?? [])
  }, [selectedDay?.activities, activeTabKind])

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

  const activeActivities = activeTabKind === 'list' ? (selectedList?.activities ?? []) : localActivities

  // Auto-fetch drive routes for transport activities that have mode=drive but no polyline yet
  useEffect(() => {
    if (!tripId || !selectedDay) return
    const pending = selectedDay.activities.filter(
      (a) => a.type === 'transport' && a.route?.mode === 'drive' && !a.route.polyline,
    )
    if (pending.length === 0) return
    if (typeof google === 'undefined' || !google.maps?.DirectionsService) return

    pending.forEach((activity) => {
      if (fetchingRoutesRef.current.has(activity.id)) return
      const idx = selectedDay.activities.indexOf(activity)
      let prevPOI: POI | undefined
      for (let j = idx - 1; j >= 0; j--) {
        if (selectedDay.activities[j].poi) { prevPOI = selectedDay.activities[j].poi; break }
      }
      let nextPOI: POI | undefined
      for (let j = idx + 1; j < selectedDay.activities.length; j++) {
        if (selectedDay.activities[j].poi) { nextPOI = selectedDay.activities[j].poi; break }
      }
      if (!prevPOI || !nextPOI) return

      fetchingRoutesRef.current.add(activity.id)
      const ds = new google.maps.DirectionsService()
      ds.route(
        {
          origin: { lat: prevPOI.lat, lng: prevPOI.lng },
          destination: { lat: nextPOI.lat, lng: nextPOI.lng },
          travelMode: google.maps.TravelMode.DRIVING,
        },
        async (result, status) => {
          fetchingRoutesRef.current.delete(activity.id)
          if (status !== 'OK' || !result) return
          const polyline: { lat: number; lng: number }[] = []
          result.routes[0].legs.forEach((leg) => {
            leg.steps.forEach((step, i) => {
              if (i === 0) polyline.push({ lat: step.start_location.lat(), lng: step.start_location.lng() })
              polyline.push({ lat: step.end_location.lat(), lng: step.end_location.lng() })
            })
          })
          const distanceM = result.routes[0].legs[0].distance?.value
          const durationS = result.routes[0].legs[0].duration?.value
          try {
            await updateActivity(tripId, selectedDay, activity.id, {
              route: { mode: 'drive', polyline, distanceM, durationS },
            })
          } catch (e) {
            console.error('Failed to save drive route', e)
          }
        },
      )
    })
  }, [selectedDay, tripId])

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
    if (activeTabKind === 'list' && selectedList && tripId) {
      const activity: Activity = { id: nanoid(8), order: selectedList.activities.length, type: 'poi', title: poi.name, poi }
      try { await addActivityToList(tripId, selectedList, activity) } catch (e) { console.error(e); toast.error('Failed to add stop') }
      return
    }
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
    if (activeTabKind === 'list' && selectedList && tripId) {
      const activity: Activity = { id: nanoid(8), order: selectedList.activities.length, type: 'note', title: 'Note', notes: '' }
      try { await addActivityToList(tripId, selectedList, activity); setEditingActivityId(activity.id) } catch (e) { console.error(e) }
      return
    }
    if (!tripId || !selectedDay) return
    const activity: Activity = { id: nanoid(8), order: selectedDay.activities.length, type: 'note', title: 'Note', notes: '' }
    try { await addActivity(tripId, selectedDay, activity); setEditingActivityId(activity.id) }
    catch (e) { console.error(e); toast.error('Failed to add note') }
  }

  const handleAddTransport = async () => {
    if (activeTabKind === 'list' && selectedList && tripId) {
      const activity: Activity = { id: nanoid(8), order: selectedList.activities.length, type: 'transport', title: 'Transport' }
      try { await addActivityToList(tripId, selectedList, activity); setEditingActivityId(activity.id) } catch (e) { console.error(e) }
      return
    }
    if (!tripId || !selectedDay) return
    const activity: Activity = { id: nanoid(8), order: selectedDay.activities.length, type: 'transport', title: 'Transport' }
    try { await addActivity(tripId, selectedDay, activity); setEditingActivityId(activity.id) }
    catch (e) { console.error(e); toast.error('Failed to add transport') }
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

  const handleDayTitleChange = (value: string) => {
    setDayTitleValue(value)
    if (dayTitleTimerRef.current) clearTimeout(dayTitleTimerRef.current)
    dayTitleTimerRef.current = setTimeout(async () => {
      if (!tripId || !selectedDayId) return
      try { await updateDayTitle(tripId, selectedDayId, value) } catch (e) { console.error(e) }
    }, 600)
  }

  const handleSelectDayFromOverview = (dayId: string) => {
    setSelectedDayId(dayId)
    setActiveTabKind('day')
    setShowOverview(false)
  }

  const handleSelectListFromOverview = (listId: string) => {
    setSelectedListId(listId)
    setActiveTabKind('list')
    setShowOverview(false)
  }

  const handleDayTabConfigChange = (cfg: DayTabConfig) => {
    setDayTabConfig(cfg)
    try { localStorage.setItem('dayTabConfig', JSON.stringify(cfg)) } catch { /* ignore */ }
  }

  const handleAddScratchList = async () => {
    if (!tripId) return
    try {
      const id = await addScratchList(tripId, 'New list')
      setSelectedListId(id)
      setActiveTabKind('list')
    } catch (e) { console.error(e); toast.error('Failed to create list') }
  }

  const handleRenameList = async (name: string) => {
    if (!selectedList || !tripId || name.trim() === selectedList.name) return
    try { await renameScratchList(tripId, selectedList.id, name.trim() || selectedList.name) }
    catch (e) { console.error(e) }
  }

  const handleDeleteList = async () => {
    if (!selectedList || !tripId) return
    if (!confirm(`Delete list "${selectedList.name}"?`)) return
    try {
      await removeScratchList(tripId, selectedList.id)
      setSelectedListId(null)
      setActiveTabKind('day')
    } catch (e) { console.error(e); toast.error('Failed to delete list') }
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

  const handleMoveActivity = async (
    activityId: string,
    fromKind: 'day' | 'list', fromId: string,
    toKind: 'day' | 'list', toId: string,
  ) => {
    if (fromKind === toKind && fromId === toId) return
    try {
      const fromDay = fromKind === 'day' ? days.find((d) => d.id === fromId) : null
      const toDay = toKind === 'day' ? days.find((d) => d.id === toId) : null
      const fromList = fromKind === 'list' ? scratchLists.find((l) => l.id === fromId) : null
      const toList = toKind === 'list' ? scratchLists.find((l) => l.id === toId) : null
      if (fromDay && toDay) await moveActivityBetweenDays(tripId, fromDay, toDay, activityId)
      else if (fromDay && toList) await moveBetweenDayAndList(tripId, fromDay, toList, activityId)
      else if (fromList && toDay) await moveFromListToDay(tripId, fromList, toDay, activityId)
      else if (fromList && toList) await moveBetweenLists(tripId, fromList, toList, activityId)
    } catch (e) {
      console.error(e)
      toast.error('Failed to move activity')
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
            <button
              onClick={() => {
                setOverviewInitialView('kanban')
                setShowOverview((v) => !v)
              }}
              title={showOverview ? 'Day view' : 'Trip overview'}
              className={`rounded p-1.5 transition ${showOverview ? 'text-sky-500 hover:bg-sky-50' : 'text-slate-400 hover:bg-slate-100'}`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                setOverviewInitialView('map')
                setShowOverview(true)
              }}
              title="Trip map overview"
              className={`rounded p-1.5 transition ${showOverview && overviewInitialView === 'map' ? 'text-sky-500 hover:bg-sky-50' : 'text-slate-400 hover:bg-slate-100'}`}
            >
              <MapIcon className="h-4 w-4" />
            </button>
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

      {!showOverview && (
      <div className="border-b border-slate-200 bg-white">
        <div className="px-4">
          {/* Day tabs row — full width */}
          <div className="flex items-center gap-2 overflow-x-auto py-2">
            <DayTabs
              days={days}
              selectedId={activeTabKind === 'day' ? selectedDayId : null}
              onSelect={(id) => { setSelectedDayId(id); setActiveTabKind('day') }}
              onAddDay={handleAddDay}
              onRemoveDay={handleRemoveDay}
              config={dayTabConfig}
              onConfigChange={handleDayTabConfigChange}
            />
          </div>
          {/* Scratch list bar — separate row, always visible */}
          <div className="flex items-center gap-2 overflow-x-auto border-t border-slate-100 py-1.5">
            <span className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Lists</span>
            {scratchLists.map((list) => (
              <button
                key={list.id}
                onClick={() => { setSelectedListId(list.id); setActiveTabKind('list') }}
                className={`flex-shrink-0 rounded-lg border py-1.5 px-3 text-sm transition ${
                  activeTabKind === 'list' && selectedListId === list.id
                    ? 'border-amber-400 bg-amber-50 text-amber-700'
                    : 'border-amber-200 bg-amber-50/40 text-amber-700 hover:bg-amber-50'
                }`}
              >
                📋 {list.name}
              </button>
            ))}
            <button
              onClick={handleAddScratchList}
              className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-50"
              title="Add planning list"
            >
              <Plus className="h-3.5 w-3.5" />
              Add list
            </button>
          </div>
        </div>
      </div>
      )}

      {/* Weather strip */}
      {trip.destination && weatherVisible && (
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-2">
          <div className="mx-auto max-w-7xl">
            <WeatherWidget lat={trip.destination.lat} lng={trip.destination.lng} />
          </div>
        </div>
      )}

      {showOverview ? (
        <div className={`flex-1 overflow-hidden bg-slate-50 ${mobileTab === 'list' ? 'block' : 'hidden md:block'}`}>
          <OverviewView
            days={days}
            scratchLists={scratchLists}
            dayOrder={trip.dayOrder}
            initialView={overviewInitialView}
            onMoveActivity={handleMoveActivity}
            onReorderActivities={async (kind, containerId, orderedIds) => {
              try {
                if (kind === 'day') {
                  const day = days.find((d) => d.id === containerId)
                  if (day) await reorderActivities(tripId, day, orderedIds)
                } else {
                  const list = scratchLists.find((l) => l.id === containerId)
                  if (list) await reorderListActivities(tripId, list, orderedIds)
                }
              } catch (e) { console.error(e); toast.error('Failed to reorder') }
            }}
            onReorderDays={async (orderedIds) => {
              const dayMap = new Map(days.map((d) => [d.id, d]))
              const orderedDays = orderedIds.map((id) => dayMap.get(id)).filter((d): d is Day => !!d)
              if (orderedDays.length === 0) return
              try { await reassignDayDates(tripId, orderedDays) }
              catch (e) { console.error(e); toast.error('Failed to reorder days') }
            }}
            onSelectActivity={(activityId, kind, containerId) => {
              if (kind === 'day') { setSelectedDayId(containerId); setActiveTabKind('day') }
              else { setSelectedListId(containerId); setActiveTabKind('list') }
              setEditingActivityId(activityId)
            }}
            onSelectDay={handleSelectDayFromOverview}
            onSelectList={handleSelectListFromOverview}
          />
        </div>
      ) : null}

      <div className={`grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-[minmax(360px,40%)_1fr] ${showOverview ? 'hidden' : ''}`}>
        <aside className={`print-area overflow-y-auto border-r border-slate-200 bg-slate-50 p-4 ${mobileTab === 'list' ? 'block' : 'hidden md:block'}`}>
          {activeTabKind === 'list' && selectedList ? (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <input
                  value={listNameValue}
                  onChange={(e) => setListNameValue(e.target.value)}
                  onBlur={(e) => handleRenameList(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  className="input flex-1 font-medium"
                  placeholder="List name…"
                />
                <button
                  onClick={handleDeleteList}
                  className="flex-shrink-0 rounded p-1 text-slate-400 hover:text-red-500"
                  title="Delete list"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {selectedList.activities.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
                  <p>Empty list.</p>
                  <p className="mt-1 text-xs">Use the search box above to add a place.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedList.activities.map((a, i) => (
                    <ListActivityRow key={a.id} activity={a} index={i} onEdit={() => setEditingActivityId(a.id)} />
                  ))}
                </div>
              )}
            </div>
          ) : !selectedDay ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
              <p>No days yet — click "Add day" to start.</p>
            </div>
          ) : (
            <>
              {/* Day title */}
              <div className="mb-3">
                <input
                  value={dayTitleValue}
                  onChange={(e) => handleDayTitleChange(e.target.value)}
                  className="input font-medium"
                  placeholder="Day title (optional)…"
                />
              </div>

              {/* Day notes — shown first */}
              <div className="mb-4">
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

              {/* Stops */}
              {localActivities.length === 0 ? (
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
                  {activitiesOpen && (
                    <>
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
                          {checkOutActivity && (
                            <HotelBanner type="checkout" hotelName={checkOutActivity.title} />
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
                          {checkInActivity && (
                            <HotelBanner type="checkin" hotelName={checkInActivity.title} />
                          )}
                        </>
                      )}
                    </>
                  )}
                </>
              )}
            </>
          )}
        {/* Budget summary */}
          {activeTabKind === 'day' && days.length > 0 && (() => {
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
          {activeTabKind === 'day' && trip && (() => {
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

          {/* Quick-add buttons at the bottom of the sidebar */}
          {(activeTabKind === 'day' ? !!selectedDay : !!selectedList) && (
            <div className="mt-4 flex gap-2 border-t border-slate-200 pt-4">
              <button
                onClick={handleAddNote}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                <StickyNote className="h-3.5 w-3.5" /> Note
              </button>
              <button
                onClick={handleAddTransport}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                🚌 Transport
              </button>
            </div>
          )}
        </aside>

        <section className={`relative ${mobileTab === 'map' ? 'block' : 'hidden md:block'}`}>
          {/* Search overlay on map */}
          <div className="absolute left-1/2 top-3 z-10 w-full max-w-sm -translate-x-1/2 px-3">
            <div className="rounded-xl shadow-lg">
              <PlacesAutocomplete onSelect={handleAddPOI} placeholder="Search to add a stop…" />
            </div>
          </div>
          <TripMap
            activities={activeActivities}
            selectedId={selectedActivityId ?? undefined}
            onSelectActivity={(id) => { setSelectedActivityId(id); setEditingActivityId(id) }}
            fallbackCenter={trip.destination ? { lat: trip.destination.lat, lng: trip.destination.lng } : undefined}
            onAddPOI={handleAddPOI}
            allDays={days}
            scratchLists={scratchLists}
            onAddToList={async (poi, listId) => {
              const list = scratchLists.find((l) => l.id === listId)
              if (!list || !tripId) return
              const activity: Activity = { id: nanoid(8), order: list.activities.length, type: 'poi', title: poi.name, poi }
              try { await addActivityToList(tripId, list, activity) } catch (e) { console.error(e); toast.error('Failed to add to list') }
            }}
            onOptimizeRoute={async (orderedIds) => {
              if (!tripId || !selectedDay) return
              const map = new Map(localActivities.map((a) => [a.id, a]))
              const reordered = orderedIds.map((id, i) => ({ ...map.get(id)!, order: i })).filter(Boolean) as Activity[]
              setLocalActivities(reordered)
              try { await reorderActivities(tripId, selectedDay, orderedIds) }
              catch (e) { console.error(e); toast.error('Optimize failed'); setLocalActivities(selectedDay.activities) }
            }}
            onAddHotel={async (poi, dayId) => {
              const day = days.find((d) => d.id === dayId)
              if (!day || !tripId) return
              const activity: Activity = {
                id: nanoid(8), order: day.activities.length,
                type: 'poi', title: poi.name,
                poi: { ...poi, category: 'hotel' },
                hotelCheckIn: dayId,
              }
              try { await addActivity(tripId, day, activity) }
              catch (e) { console.error(e); toast.error('Failed to add hotel') }
            }}
          />
        </section>
      </div>

      {/* Mobile bottom tab bar */}
      <nav className="print-hide fixed bottom-0 left-0 right-0 z-30 flex border-t border-slate-200 bg-white md:hidden">
        <button
          onClick={() => { setMobileTab('list'); setShowOverview(false) }}
          className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${mobileTab === 'list' && !showOverview ? 'text-sky-600' : 'text-slate-500'}`}
        >
          <LayoutList className="h-5 w-5" />
          List
        </button>
        <button
          onClick={() => { setMobileTab('list'); setShowOverview(true) }}
          className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${showOverview ? 'text-sky-600' : 'text-slate-500'}`}
        >
          <LayoutGrid className="h-5 w-5" />
          Overview
        </button>
        <button
          onClick={() => { setMobileTab('map'); setShowOverview(false) }}
          className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${mobileTab === 'map' && !showOverview ? 'text-sky-600' : 'text-slate-500'}`}
        >
          <MapPin className="h-5 w-5" />
          Map
        </button>
      </nav>

      {(editingDay || editingList) && (
        <ActivityEditModal
          open={!!editingActivity}
          onClose={() => setEditingActivityId(null)}
          activity={editingActivity}
          currency={trip.currency}
          onSave={async (patch) => {
            if (editingDay) await updateActivity(tripId, editingDay, editingActivity!.id, patch)
            else if (editingList) await updateActivityInList(tripId, editingList, editingActivity!.id, patch)
          }}
          onDelete={async () => {
            if (editingDay) await removeActivity(tripId, editingDay, editingActivity!.id)
            else if (editingList) await removeActivityFromList(tripId, editingList, editingActivity!.id)
          }}
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

function HotelBanner({ type, hotelName }: { type: 'checkin' | 'checkout'; hotelName: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
      <span className="text-base">🏨</span>
      <span className="font-semibold">{type === 'checkin' ? 'Check in' : 'Check out'}:</span>
      <span className="truncate">{hotelName}</span>
    </div>
  )
}

function ListActivityRow({ activity, index, onEdit }: { activity: Activity; index: number; onEdit: () => void }) {
  const icon = activity.type === 'poi' ? '📍' : activity.type === 'transport' ? '🚌' : '📝'
  return (
    <div
      onClick={onEdit}
      className="cursor-pointer rounded-lg border border-slate-200 bg-white p-3 transition hover:border-amber-300 hover:shadow-sm"
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-sm">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-slate-900">{activity.title}</div>
          {activity.poi?.address && (
            <div className="mt-0.5 truncate text-xs text-slate-500">{activity.poi.address}</div>
          )}
          {activity.startTime && (
            <div className="mt-0.5 text-xs text-slate-400">
              {activity.startTime}{activity.durationMinutes ? ` · ${activity.durationMinutes}m` : ''}
            </div>
          )}
          {activity.notes && (
            <p className="mt-1 line-clamp-2 text-xs text-slate-500">{activity.notes}</p>
          )}
        </div>
        <span className="flex-shrink-0 text-[10px] text-slate-400">#{index + 1}</span>
      </div>
    </div>
  )
}
