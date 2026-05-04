import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { nanoid } from 'nanoid'
import { ChevronLeft, MapPin } from 'lucide-react'
import Header from '@/components/Header'
import DayTabs from '@/components/DayTabs'
import ActivityCard from '@/components/ActivityCard'
import ActivityEditModal from '@/components/ActivityEditModal'
import PlacesAutocomplete from '@/components/PlacesAutocomplete'
import TripMap from '@/components/TripMap'
import { subscribeTrip, subscribeDays, addDay, removeDay, addActivity, deleteTrip } from '@/lib/firestore/trips'
import type { Trip, Day, Activity, POI } from '@/lib/types'
import { todayISO, addDaysISO, formatDateISO } from '@/lib/utils'

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
    () => selectedDay?.activities.find((a) => a.id === editingActivityId) ?? null,
    [selectedDay, editingActivityId],
  )

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
          <button onClick={handleDeleteTrip} className="text-sm text-red-600 hover:underline">Delete trip</button>
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
            <div className="space-y-2">
              {selectedDay.activities.map((a, i) => (
                <ActivityCard
                  key={a.id}
                  activity={a}
                  index={i}
                  selected={selectedActivityId === a.id}
                  onSelect={() => { setSelectedActivityId(a.id); setEditingActivityId(a.id) }}
                />
              ))}
            </div>
          )}
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
