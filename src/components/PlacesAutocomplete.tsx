import { useEffect, useRef, useState } from 'react'
import { useMapsLibrary } from '@vis.gl/react-google-maps'
import type { ActivityCategory, POI } from '@/lib/types'

function typesToCategory(types: string[]): ActivityCategory | undefined {
  if (types.some((t) => ['restaurant','food','bakery','cafe','meal_takeaway','meal_delivery','bar'].includes(t))) return 'food'
  if (types.some((t) => t === 'lodging')) return 'hotel'
  if (types.some((t) => ['transit_station','bus_station','train_station','subway_station','airport','ferry_terminal'].includes(t))) return 'transport'
  if (types.some((t) => ['museum','tourist_attraction','point_of_interest','art_gallery','church','park','amusement_park','zoo','aquarium','stadium','natural_feature'].includes(t))) return 'sight'
  return undefined
}

type Props = {
  onSelect: (poi: POI) => void
  placeholder?: string
  className?: string
}

export default function PlacesAutocomplete({ onSelect, placeholder, className }: Props) {
  const places = useMapsLibrary('places')
  const [input, setInput] = useState('')
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const sessionToken = useRef<google.maps.places.AutocompleteSessionToken | null>(null)

  useEffect(() => {
    if (!places) return
    sessionToken.current = new places.AutocompleteSessionToken()
  }, [places])

  useEffect(() => {
    if (!places || !input.trim()) {
      setSuggestions([])
      return
    }
    const handle = setTimeout(async () => {
      try {
        const { suggestions: results } = await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input,
          sessionToken: sessionToken.current ?? undefined,
        })
        setSuggestions(results ?? [])
      } catch {
        setSuggestions([])
      }
    }, 200)
    return () => clearTimeout(handle)
  }, [input, places])

  const handlePick = async (suggestion: google.maps.places.AutocompleteSuggestion) => {
    if (!places) return
    try {
      const placePrediction = suggestion.placePrediction
      if (!placePrediction) return
      const place = placePrediction.toPlace()
      await place.fetchFields({
        fields: ['id', 'displayName', 'location', 'formattedAddress', 'rating', 'photos', 'websiteURI', 'types'],
      })

      const location = place.location
      if (!location) return

      const poi: POI = {
        placeId: place.id,
        name: place.displayName ?? placePrediction.mainText?.text ?? '',
        lat: location.lat(),
        lng: location.lng(),
        address: place.formattedAddress ?? undefined,
        category: typesToCategory(place.types ?? []),
        rating: place.rating ?? undefined,
        url: place.websiteURI ?? undefined,
        photoUrl: place.photos?.[0]?.getURI({ maxWidth: 400 }),
      }

      // Reset session token after a place is selected
      sessionToken.current = new places.AutocompleteSessionToken()
      setInput('')
      setSuggestions([])
      setOpen(false)
      onSelect(poi)
    } catch (e) {
      console.error('Place details fetch failed', e)
    }
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
      {open && suggestions.length > 0 && (
        <ul className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          {suggestions.map((s, i) => {
            const pred = s.placePrediction
            return (
              <li
                key={pred?.placeId ?? i}
                onMouseDown={(e) => { e.preventDefault(); handlePick(s) }}
                className="cursor-pointer border-b border-slate-100 px-3 py-2 text-sm last:border-0 hover:bg-slate-50"
              >
                <div className="font-medium">{pred?.mainText?.text ?? ''}</div>
                <div className="truncate text-xs text-slate-500">{pred?.secondaryText?.text ?? ''}</div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
