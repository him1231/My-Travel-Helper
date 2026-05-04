import { Link } from 'react-router-dom'
import { Calendar, MapPin, Trash2 } from 'lucide-react'
import type { Trip } from '@/lib/types'
import { formatDateISO } from '@/lib/utils'

export default function TripCard({ trip, onDelete }: { trip: Trip; onDelete: () => void }) {
  const coverPhoto = trip.coverPhotoUrl || trip.destination?.photoUrl

  return (
    <div className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      {coverPhoto && (
        <div className="h-36 w-full overflow-hidden">
          <img src={coverPhoto} alt={trip.title} className="h-full w-full object-cover" />
        </div>
      )}
      <Link to={`/trips/${trip.id}`} className="block p-5">
        <div className="font-semibold text-slate-900">{trip.title}</div>
        {trip.description && (
          <p className="mt-0.5 line-clamp-2 text-sm text-slate-500">{trip.description}</p>
        )}
        {trip.destination && (
          <div className="mt-1 flex items-center gap-1 text-sm text-slate-600">
            <MapPin className="h-3.5 w-3.5" />
            <span className="truncate">{trip.destination.name}</span>
          </div>
        )}
        {trip.startDate && (
          <div className="mt-1 flex items-center gap-1 text-sm text-slate-600">
            <Calendar className="h-3.5 w-3.5" />
            {formatDateISO(trip.startDate)}{trip.endDate ? ` – ${formatDateISO(trip.endDate)}` : ''}
          </div>
        )}
      </Link>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete() }}
        className="absolute right-2 top-2 rounded p-1.5 text-slate-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
        aria-label="Delete trip"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}
