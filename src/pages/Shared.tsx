import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Calendar, MapPin } from 'lucide-react'
import TripMap from '@/components/TripMap'
import { getTripByShareToken, subscribeTrip, subscribeDays } from '@/lib/firestore/trips'
import type { Trip, Day } from '@/lib/types'
import { formatDateISO, formatMoney } from '@/lib/utils'

export default function Shared() {
  const { token } = useParams<{ token: string }>()
  const [trip, setTrip] = useState<Trip | null>(null)
  const [days, setDays] = useState<Day[]>([])
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!token) return
    let unsubTrip: (() => void) | null = null
    let unsubDays: (() => void) | null = null
    let cancelled = false

    getTripByShareToken(token)
      .then((t) => {
        if (cancelled) return
        if (!t) { setNotFound(true); setLoading(false); return }
        // Subscribe live so token revocation by the owner kicks the viewer out.
        unsubTrip = subscribeTrip(t.id, (live) => {
          if (!live || live.shareToken !== token) {
            setTrip(null); setNotFound(true); setLoading(false)
            return
          }
          setTrip(live); setLoading(false)
        })
        unsubDays = subscribeDays(t.id, (d) => {
          setDays(d)
          setSelectedDayId((cur) => cur ?? d[0]?.id ?? null)
        })
      })
      .catch(() => { if (!cancelled) { setNotFound(true); setLoading(false) } })

    return () => {
      cancelled = true
      unsubTrip?.()
      unsubDays?.()
    }
  }, [token])

  if (loading) {
    return <div className="grid h-screen place-items-center text-slate-500">Loading…</div>
  }
  if (notFound || !trip) {
    return (
      <div className="grid h-screen place-items-center text-slate-500">
        <div className="text-center">
          <p className="text-lg font-semibold">Trip not found</p>
          <p className="mt-1 text-sm">This shared link may have expired or been removed.</p>
        </div>
      </div>
    )
  }

  const selectedDay = days.find((d) => d.id === selectedDayId) ?? null

  return (
    <div className="flex h-screen flex-col">
      {/* Header bar */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-lg font-semibold">{trip.title}</h1>
              <span className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-500">
                Read-only
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              {trip.destination && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {trip.destination.name}
                </span>
              )}
              {trip.startDate && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatDateISO(trip.startDate)}{trip.endDate ? ` – ${formatDateISO(trip.endDate)}` : ''}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Day tabs */}
      {days.length > 0 && (
        <div className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-7xl flex-wrap gap-2 px-4 py-3">
            {days.map((d, i) => (
              <button
                key={d.id}
                onClick={() => setSelectedDayId(d.id)}
                className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                  selectedDayId === d.id
                    ? 'border-sky-500 bg-sky-50 text-sky-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="font-medium">Day {i + 1}</span>
                <span className="ml-2 text-xs text-slate-500">{formatDateISO(d.date)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main content: sidebar + map */}
      <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-[minmax(360px,40%)_1fr]">
        <aside className="overflow-y-auto border-r border-slate-200 bg-slate-50 p-4">
          {!selectedDay || selectedDay.activities.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
              No activities planned for this day.
            </div>
          ) : (
            <div className="space-y-2">
              {selectedDay.activities.map((a, i) => (
                <div
                  key={a.id}
                  className="rounded-lg border border-slate-200 bg-white p-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-rose-500 text-xs font-bold text-white">
                      {i + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-slate-900">{a.title}</div>
                      {a.poi?.address && (
                        <div className="mt-0.5 text-xs text-slate-500">{a.poi.address}</div>
                      )}
                      <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-slate-500">
                        {a.startTime && (
                          <span>{a.startTime}{a.durationMinutes ? ` · ${a.durationMinutes}m` : ''}</span>
                        )}
                        {a.cost && a.cost.amount > 0 && (
                          <span>{formatMoney(a.cost.amount, a.cost.currency)}</span>
                        )}
                      </div>
                      {a.notes && <p className="mt-1.5 text-xs text-slate-600">{a.notes}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedDay?.notes && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
              <div className="mb-1 font-medium text-slate-700">Day notes</div>
              {selectedDay.notes}
            </div>
          )}
        </aside>

        <section className="relative">
          <TripMap
            activities={selectedDay?.activities ?? []}
            fallbackCenter={trip.destination ? { lat: trip.destination.lat, lng: trip.destination.lng } : undefined}
          />
        </section>
      </div>
    </div>
  )
}
