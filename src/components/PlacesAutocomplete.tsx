import { useEffect, useRef, useState } from 'react'
import { useMapsLibrary } from '@vis.gl/react-google-maps'
import type { POI } from '@/lib/types'

type Props = {
  onSelect: (poi: POI) => void
  placeholder?: string
  className?: string
}

export default function PlacesAutocomplete({ onSelect, placeholder, className }: Props) {
  const places = useMapsLibrary('places')
  const [input, setInput] = useState('')
  const [predictions, setPredictions] = useState<google.maps.places.AutocompletePrediction[]>([])
  const [open, setOpen] = useState(false)
  const sessionToken = useRef<google.maps.places.AutocompleteSessionToken | null>(null)
  const autocompleteService = useRef<google.maps.places.AutocompleteService | null>(null)
  const placesService = useRef<google.maps.places.PlacesService | null>(null)

  useEffect(() => {
    if (!places) return
    autocompleteService.current = new places.AutocompleteService()
    sessionToken.current = new places.AutocompleteSessionToken()
    const div = document.createElement('div')
    placesService.current = new places.PlacesService(div)
  }, [places])

  useEffect(() => {
    if (!input.trim() || !autocompleteService.current) {
      setPredictions([])
      return
    }
    const handle = setTimeout(() => {
      autocompleteService.current!.getPlacePredictions(
        { input, sessionToken: sessionToken.current ?? undefined },
        (preds) => setPredictions(preds ?? []),
      )
    }, 200)
    return () => clearTimeout(handle)
  }, [input])

  const handlePick = (pred: google.maps.places.AutocompletePrediction) => {
    if (!placesService.current || !places) return
    placesService.current.getDetails(
      {
        placeId: pred.place_id,
        fields: ['place_id', 'name', 'geometry', 'formatted_address', 'rating', 'photos', 'url'],
        sessionToken: sessionToken.current ?? undefined,
      },
      (place, status) => {
        if (status !== google.maps.places.PlacesServiceStatus.OK || !place || !place.geometry?.location) return
        const poi: POI = {
          placeId: place.place_id ?? pred.place_id,
          name: place.name ?? pred.structured_formatting.main_text,
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
          address: place.formatted_address,
          rating: place.rating,
          url: place.url,
          photoUrl: place.photos?.[0]?.getUrl({ maxWidth: 400 }),
        }
        sessionToken.current = new places.AutocompleteSessionToken()
        setInput('')
        setPredictions([])
        setOpen(false)
        onSelect(poi)
      },
    )
  }

  return (
    <div className={`relative ${className ?? ''}`}>
      <input
        value={input}
        onChange={(e) => { setInput(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder ?? 'Search places…'}
        disabled={!places}
        className="input"
      />
      {open && predictions.length > 0 && (
        <ul className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          {predictions.map((p) => (
            <li
              key={p.place_id}
              onMouseDown={(e) => { e.preventDefault(); handlePick(p) }}
              className="cursor-pointer border-b border-slate-100 px-3 py-2 text-sm last:border-0 hover:bg-slate-50"
            >
              <div className="font-medium">{p.structured_formatting.main_text}</div>
              <div className="truncate text-xs text-slate-500">{p.structured_formatting.secondary_text}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
