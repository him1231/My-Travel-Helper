import { useEffect, useRef, useState } from 'react'
import { useMapsLibrary } from '@vis.gl/react-google-maps'
import { X } from 'lucide-react'
import type { POI } from '@/lib/types'

interface Props {
  center: { lat: number; lng: number }
  onAdd: (poi: POI) => void
  onClose: () => void
}

export default function NearbyDrawer({ center, onAdd, onClose }: Props) {
  const places = useMapsLibrary('places')
  const [results, setResults] = useState<google.maps.places.PlaceResult[]>([])
  const [loading, setLoading] = useState(true)
  const serviceRef = useRef<google.maps.places.PlacesService | null>(null)

  useEffect(() => {
    if (!places) return
    const div = document.createElement('div')
    serviceRef.current = new places.PlacesService(div)
    setLoading(true)
    serviceRef.current.nearbySearch(
      { location: center, radius: 800, type: 'tourist_attraction' },
      (results, status) => {
        setLoading(false)
        if (status === google.maps.places.PlacesServiceStatus.OK && results) {
          setResults(results.slice(0, 10))
        }
      },
    )
  }, [places, center.lat, center.lng])

  const handleAdd = (place: google.maps.places.PlaceResult) => {
    if (!place.geometry?.location) return
    const poi: POI = {
      placeId: place.place_id,
      name: place.name ?? 'Unknown',
      lat: place.geometry.location.lat(),
      lng: place.geometry.location.lng(),
      address: place.vicinity,
      rating: place.rating,
      photoUrl: place.photos?.[0]?.getUrl({ maxWidth: 400 }),
    }
    onAdd(poi)
  }

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-white shadow-md">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <span className="text-sm font-semibold text-slate-700">Nearby suggestions</span>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {loading ? (
          <p className="p-4 text-sm text-slate-400">Searching nearby…</p>
        ) : results.length === 0 ? (
          <p className="p-4 text-sm text-slate-400">No results found.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {results.map((place) => (
              <li key={place.place_id} className="flex items-center gap-3 px-4 py-2.5">
                {place.photos?.[0] && (
                  <img
                    src={place.photos[0].getUrl({ maxWidth: 48, maxHeight: 48 })}
                    alt=""
                    className="h-10 w-10 flex-shrink-0 rounded object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-800">{place.name}</div>
                  {place.rating && (
                    <div className="text-xs text-slate-400">⭐ {place.rating.toFixed(1)}</div>
                  )}
                </div>
                <button
                  onClick={() => handleAdd(place)}
                  className="flex-shrink-0 rounded-lg bg-sky-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-700"
                >
                  + Add
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
