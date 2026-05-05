import { useCallback, useEffect, useMemo, useState } from 'react'
import { Map, Marker, Polyline, useMap, useMapsLibrary } from '@vis.gl/react-google-maps'
import { Star, X, Plus, Check } from 'lucide-react'
import type { Activity, ActivityCategory, POI } from '@/lib/types'

type Segment = {
  path: { lat: number; lng: number }[]
  mode: 'straight' | 'drive'
}

type Props = {
  activities: Activity[]
  selectedId?: string
  onSelectActivity?: (id: string) => void
  fallbackCenter?: { lat: number; lng: number }
  onAddPOI?: (poi: POI) => void
}

function placeTypesToCategory(types: string[]): ActivityCategory {
  if (types.some((t) => ['restaurant', 'food', 'bakery', 'cafe', 'meal_takeaway', 'meal_delivery', 'bar'].includes(t))) return 'food'
  if (types.some((t) => ['lodging'].includes(t))) return 'hotel'
  if (types.some((t) => ['transit_station', 'bus_station', 'train_station', 'subway_station', 'airport', 'ferry_terminal'].includes(t))) return 'transport'
  if (types.some((t) => ['museum', 'tourist_attraction', 'point_of_interest', 'art_gallery', 'church', 'park', 'amusement_park', 'zoo', 'aquarium', 'stadium', 'natural_feature'].includes(t))) return 'sight'
  return 'other'
}

export default function TripMap({ activities, selectedId, onSelectActivity, fallbackCenter, onAddPOI }: Props) {
  const [mapPOI, setMapPOI] = useState<POI | null>(null)

  const points = useMemo(
    () => activities.map((a) => a.poi).filter((p): p is POI => !!p),
    [activities],
  )

  const segments = useMemo<Segment[]>(() => {
    const result: Segment[] = []
    for (let i = 0; i < activities.length; i++) {
      const a = activities[i]
      if (a.type !== 'transport') continue
      let prev: POI | undefined
      for (let j = i - 1; j >= 0; j--) {
        if (activities[j].poi) { prev = activities[j].poi; break }
      }
      let next: POI | undefined
      for (let j = i + 1; j < activities.length; j++) {
        if (activities[j].poi) { next = activities[j].poi; break }
      }
      if (!prev || !next) continue
      const mode = a.route?.mode ?? 'straight'
      const path = (mode === 'drive' && a.route?.polyline?.length)
        ? a.route.polyline
        : [{ lat: prev.lat, lng: prev.lng }, { lat: next.lat, lng: next.lng }]
      result.push({ path, mode })
    }
    return result
  }, [activities])

  const addedPlaceIds = useMemo(
    () => new Set(activities.filter((a) => a.poi?.placeId).map((a) => a.poi!.placeId!)),
    [activities],
  )

  const handleAdd = useCallback(() => {
    if (!mapPOI || !onAddPOI) return
    onAddPOI(mapPOI)
  }, [mapPOI, onAddPOI])

  const isAdded = !!(mapPOI?.placeId && addedPlaceIds.has(mapPOI.placeId))

  return (
    <div className="relative h-full w-full">
      <Map
        defaultCenter={fallbackCenter ?? { lat: 20, lng: 0 }}
        defaultZoom={fallbackCenter ? 11 : 2}
        gestureHandling="greedy"
        disableDefaultUI={false}
        style={{ width: '100%', height: '100%' }}
      >
        <FitToPoints points={points} fallbackCenter={fallbackCenter} />
        <MapClickHandler
          onPOISelected={setMapPOI}
          onDismiss={() => setMapPOI(null)}
        />
        {segments.map((seg, i) => (
          <Polyline
            key={i}
            path={seg.path}
            strokeColor={seg.mode === 'drive' ? '#10b981' : '#3b82f6'}
            strokeOpacity={seg.mode === 'drive' ? 0.85 : 0.55}
            strokeWeight={seg.mode === 'drive' ? 4 : 2}
            geodesic
          />
        ))}
        {activities.map((a, idx) =>
          a.poi ? (
            <Marker
              key={a.id}
              position={{ lat: a.poi.lat, lng: a.poi.lng }}
              label={{ text: String(idx + 1), color: 'white', fontWeight: 'bold' }}
              onClick={() => onSelectActivity?.(a.id)}
              animation={selectedId === a.id ? google.maps.Animation.BOUNCE : undefined}
            />
          ) : null,
        )}
      </Map>

      {/* POI bottom sheet */}
      {mapPOI && (
        <div className="absolute bottom-0 left-0 right-0 z-10 rounded-t-2xl bg-white shadow-2xl transition-transform">
          {mapPOI.photoUrl && (
            <img
              src={mapPOI.photoUrl}
              alt={mapPOI.name}
              className="h-36 w-full rounded-t-2xl object-cover"
            />
          )}
          <div className="p-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-slate-800">{mapPOI.name}</h3>
                {mapPOI.address && (
                  <p className="mt-0.5 text-xs text-slate-500">{mapPOI.address}</p>
                )}
                {mapPOI.rating && (
                  <div className="mt-1 flex items-center gap-1">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    <span className="text-xs font-medium text-slate-700">{mapPOI.rating.toFixed(1)}</span>
                  </div>
                )}
              </div>
              <button
                onClick={() => setMapPOI(null)}
                className="flex-shrink-0 rounded-full p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {onAddPOI && (
              <button
                onClick={isAdded ? undefined : handleAdd}
                disabled={isAdded}
                className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition ${
                  isAdded
                    ? 'bg-emerald-50 text-emerald-600'
                    : 'bg-sky-600 text-white hover:bg-sky-700 active:bg-sky-800'
                }`}
              >
                {isAdded ? (
                  <><Check className="h-4 w-4" /> Already in your day</>
                ) : (
                  <><Plus className="h-4 w-4" /> Add to day</>
                )}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Inner components ──────────────────────────────────────────────────────────

function MapClickHandler({
  onPOISelected,
  onDismiss,
}: {
  onPOISelected: (poi: POI) => void
  onDismiss: () => void
}) {
  const map = useMap()
  const placesLib = useMapsLibrary('places')

  const handlePOISelected = useCallback(onPOISelected, [onPOISelected])
  const handleDismiss = useCallback(onDismiss, [onDismiss])

  useEffect(() => {
    if (!map || !placesLib) return

    const listener = map.addListener('click', async (e: google.maps.MapMouseEvent & { placeId?: string }) => {
      if (!e.placeId) {
        handleDismiss()
        return
      }
      // Suppress the default Google Maps InfoWindow
      ;(e as { stop?: () => void }).stop?.()

      try {
        const place = new google.maps.places.Place({ id: e.placeId })
        await place.fetchFields({
          fields: ['id', 'displayName', 'location', 'formattedAddress', 'rating', 'photos', 'types'],
        })
        if (!place.location) return

        const poi: POI = {
          placeId: place.id,
          name: place.displayName ?? '',
          lat: place.location.lat(),
          lng: place.location.lng(),
          address: place.formattedAddress ?? undefined,
          rating: place.rating ?? undefined,
          category: placeTypesToCategory(place.types ?? []),
          photoUrl: place.photos?.[0]?.getURI({ maxWidth: 480, maxHeight: 320 }) ?? undefined,
        }
        handlePOISelected(poi)
      } catch (err) {
        console.error('POI fetch failed', err)
      }
    })

    return () => { google.maps.event.removeListener(listener) }
  }, [map, placesLib, handlePOISelected, handleDismiss])

  return null
}

function FitToPoints({
  points, fallbackCenter,
}: {
  points: POI[]
  fallbackCenter?: { lat: number; lng: number }
}) {
  const map = useMap()
  const signature = points.map((p) => `${p.lat},${p.lng}`).join('|')

  useEffect(() => {
    if (!map) return
    if (points.length === 0) {
      if (fallbackCenter) { map.setCenter(fallbackCenter); map.setZoom(11) }
      return
    }
    if (points.length === 1) { map.setCenter({ lat: points[0].lat, lng: points[0].lng }); map.setZoom(13); return }
    const bounds = new google.maps.LatLngBounds()
    points.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }))
    map.fitBounds(bounds, 80)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, signature])

  return null
}
