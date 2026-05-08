import { Clock, GripVertical, MapPin, Plane, StickyNote, Ticket, Truck, Wallet } from 'lucide-react'
import clsx from 'clsx'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Activity } from '@/lib/types'
import { formatMoney } from '@/lib/utils'
import Linkify from '@/components/Linkify'

const TYPE_STYLES: Record<string, { badge: string; border: string }> = {
  poi: { badge: 'bg-rose-500', border: '' },
  note: { badge: 'bg-amber-400', border: 'border-amber-100 bg-amber-50' },
  transport: { badge: 'bg-sky-500', border: 'border-sky-100 bg-sky-50' },
  hotel: { badge: 'bg-indigo-500', border: 'border-indigo-100 bg-indigo-50/40' },
  flight: { badge: 'bg-cyan-600', border: 'border-cyan-100 bg-cyan-50/40' },
}

// "2026-05-08T14:30" → "14:30" (or pass-through HH:mm)
function timeOf(iso?: string): string | undefined {
  if (!iso) return undefined
  const t = iso.includes('T') ? iso.split('T')[1] : iso
  return t?.slice(0, 5)
}

function dateOf(iso?: string): string | undefined {
  if (!iso || !iso.includes('T')) return undefined
  return iso.split('T')[0]
}

function overnightSuffix(depIso?: string, arrIso?: string): string {
  const dd = dateOf(depIso); const ad = dateOf(arrIso)
  if (!dd || !ad || dd === ad) return ''
  const days = Math.round((new Date(ad).getTime() - new Date(dd).getTime()) / 86_400_000)
  return days > 0 ? `+${days}` : ''
}

export default function ActivityCard({
  activity, index, selected, onSelect,
}: {
  activity: Activity
  index: number
  selected?: boolean
  onSelect?: () => void
}) {
  const a = activity
  const isHotel = a.poi?.category === 'hotel' && !!a.hotelCheckIn
  const isFlight = a.type === 'flight'
  const style_info = isHotel ? TYPE_STYLES.hotel : (TYPE_STYLES[a.type] ?? TYPE_STYLES.poi)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: a.id })

  const dndStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={dndStyle}
      onClick={onSelect}
      className={clsx(
        'cursor-pointer rounded-lg border p-3 transition',
        selected ? 'border-sky-500 ring-2 ring-sky-200' : `border-slate-200 hover:border-slate-300 ${style_info.border}`,
      )}
    >
      <div className="flex items-start gap-3">
        <button
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5 flex-shrink-0 cursor-grab touch-none text-slate-300 hover:text-slate-500 active:cursor-grabbing"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className={`grid h-7 w-7 flex-shrink-0 place-items-center rounded-full text-xs font-bold text-white ${style_info.badge}`}>
          {isFlight ? <Plane className="h-3.5 w-3.5" />
            : isHotel ? '🏨'
            : a.type === 'note' ? <StickyNote className="h-3.5 w-3.5" />
            : a.type === 'transport' ? <Truck className="h-3.5 w-3.5" />
            : index + 1}
        </div>
        <div className="min-w-0 flex-1">
          {isFlight && a.flight ? (
            <FlightSummary flight={a.flight} />
          ) : (
            <div className="font-medium text-slate-900">{a.title}</div>
          )}
          {a.poi?.address && (
            <div className="mt-0.5 flex items-start gap-1 text-xs text-slate-500">
              <MapPin className="mt-0.5 h-3 w-3 flex-shrink-0" />
              <span className="truncate">{a.poi.address}</span>
            </div>
          )}
          <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-slate-500">
            {a.startTime && !isFlight && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {a.startTime}{a.durationMinutes ? ` · ${a.durationMinutes}m` : ''}
              </span>
            )}
            {a.cost && a.cost.amount > 0 && (
              <span className="flex items-center gap-1">
                <Wallet className="h-3 w-3" />
                {formatMoney(a.cost.amount, a.cost.currency)}
              </span>
            )}
          </div>
          {a.notes && <Linkify text={a.notes} className="mt-1.5 whitespace-pre-wrap text-xs text-slate-600" />}
          {/* Photo thumbnails */}
          {a.photos && a.photos.length > 0 && (
            <div className="mt-2 flex gap-1 overflow-x-auto">
              {a.photos.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt=""
                  className="h-12 w-12 flex-shrink-0 rounded object-cover"
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function FlightSummary({ flight }: { flight: NonNullable<Activity['flight']> }) {
  const dep = flight.departure
  const arr = flight.arrival
  const depTime = timeOf(dep.time)
  const arrTime = timeOf(arr.time)
  const overnight = overnightSuffix(dep.time, arr.time)
  const flightLabel = [flight.airline, flight.flightNumber].filter(Boolean).join(' · ') || 'Flight'
  const route = (dep.airportCode || '???') + ' → ' + (arr.airportCode || '???')
  const timeRange = (depTime || '—:—') + ' → ' + (arrTime || '—:—') + overnight

  return (
    <>
      <div className="font-medium text-slate-900">{flightLabel}</div>
      <div className="mt-0.5 text-xs font-medium text-slate-700">
        {route}
        <span className="ml-2 text-slate-500">{timeRange}</span>
      </div>
      {(dep.terminal || dep.gate || arr.terminal || arr.gate) && (
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
          {dep.terminal && <span>Dep T{dep.terminal}{dep.gate ? ` · Gate ${dep.gate}` : ''}</span>}
          {arr.terminal && <span>Arr T{arr.terminal}{arr.gate ? ` · Gate ${arr.gate}` : ''}</span>}
        </div>
      )}
      {(flight.confirmation || flight.seat || flight.bookingClass) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
          {flight.confirmation && (
            <span className="flex items-center gap-1">
              <Ticket className="h-3 w-3" /> {flight.confirmation}
            </span>
          )}
          {flight.seat && <span>Seat {flight.seat}</span>}
          {flight.bookingClass && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{flight.bookingClass}</span>}
        </div>
      )}
    </>
  )
}
