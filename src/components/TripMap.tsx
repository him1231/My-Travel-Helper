import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Circle, Map, Marker, Polyline, useMap, useMapsLibrary } from '@vis.gl/react-google-maps'
import { Check, ChevronRight, Layers, Plus, Route, Star, X, Zap } from 'lucide-react'
import type { Activity, ActivityCategory, Day, POI, ScratchList } from '@/lib/types'

// ── Constants ──────────────────────────────────────────────────────────────────

const DAY_COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899','#14b8a6']

const EXPLORE_CATS = [
  { key: 'restaurant',         emoji: '🍽️', label: 'Food' },
  { key: 'tourist_attraction', emoji: '🏛️', label: 'Sights' },
  { key: 'lodging',            emoji: '🏨', label: 'Hotels' },
  { key: 'transit_station',    emoji: '🚇', label: 'Transit' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const lat1 = a.lat * Math.PI / 180
  const lat2 = b.lat * Math.PI / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

function midpoint(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  return { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 }
}

function fmtDist(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}m`
  return `${km.toFixed(1)}km`
}

function fmtWalk(km: number): string {
  const min = Math.round(km / 5 * 60)
  return min < 60 ? `${min}m walk` : `${(min / 60).toFixed(1)}h walk`
}

function makeLabelSvg(text: string): string {
  const w = Math.max(52, text.length * 7 + 12)
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20">
      <rect x="0" y="0" width="${w}" height="20" rx="4" fill="white" stroke="#94a3b8" stroke-width="1" opacity="0.95"/>
      <text x="${w / 2}" y="14" text-anchor="middle" font-size="9.5" font-family="Arial,sans-serif" fill="#475569">${text}</text>
    </svg>`
  )}`
}

function placeTypesToCategory(types: string[]): ActivityCategory {
  if (types.some((t) => ['restaurant','food','bakery','cafe','meal_takeaway','meal_delivery','bar'].includes(t))) return 'food'
  if (types.some((t) => ['lodging'].includes(t))) return 'hotel'
  if (types.some((t) => ['transit_station','bus_station','train_station','subway_station','airport','ferry_terminal'].includes(t))) return 'transport'
  if (types.some((t) => ['museum','tourist_attraction','point_of_interest','art_gallery','church','park','amusement_park','zoo','aquarium','stadium','natural_feature'].includes(t))) return 'sight'
  return 'other'
}

function greedyOptimize(activities: Activity[]): string[] {
  const pois = activities.filter((a) => a.poi)
  if (pois.length <= 2) return activities.map((a) => a.id)
  const visited = new Set<string>()
  const ordered: Activity[] = []
  let cur = pois[0]
  visited.add(cur.id)
  ordered.push(cur)
  while (ordered.length < pois.length) {
    let best: Activity | null = null
    let bestD = Infinity
    for (const a of pois) {
      if (visited.has(a.id)) continue
      const d = haversineKm(cur.poi!, a.poi!)
      if (d < bestD) { bestD = d; best = a }
    }
    if (!best) break
    visited.add(best.id)
    ordered.push(best)
    cur = best
  }
  const nonPoi = activities.filter((a) => !a.poi)
  return [...ordered, ...nonPoi].map((a) => a.id)
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Segment = { path: { lat: number; lng: number }[]; mode: 'straight' | 'drive' }

type Props = {
  activities: Activity[]
  selectedId?: string
  onSelectActivity?: (id: string) => void
  fallbackCenter?: { lat: number; lng: number }
  onAddPOI?: (poi: POI) => void
  allDays?: Day[]
  scratchLists?: ScratchList[]
  onAddToList?: (poi: POI, listId: string) => void
  onOptimizeRoute?: (orderedIds: string[]) => void
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TripMap({
  activities, selectedId, onSelectActivity, fallbackCenter,
  onAddPOI, allDays, scratchLists, onAddToList, onOptimizeRoute,
}: Props) {
  const [mapPOI, setMapPOI]           = useState<POI | null>(null)
  const [nearbyPOIs, setNearbyPOIs]   = useState<POI[]>([])
  const [loadingNearby, setLoadingNearby] = useState(false)
  const [walkMin, setWalkMin]         = useState(15)
  const [showRoute, setShowRoute]     = useState(true)
  const [showAllDays, setShowAllDays] = useState(false)
  const [exploreType, setExploreType] = useState<string | null>(null)
  const [explorePlaces, setExplorePlaces] = useState<POI[]>([])
  const [loadingExplore, setLoadingExplore] = useState(false)
  const [searchPin, setSearchPin]     = useState<{ lat: number; lng: number } | null>(null)
  const [listOpen, setListOpen]       = useState(false)

  const addedPlaceIds = useMemo(
    () => new Set(activities.filter((a) => a.poi?.placeId).map((a) => a.poi!.placeId!)),
    [activities],
  )

  const points = useMemo(
    () => activities.map((a) => a.poi).filter((p): p is POI => !!p),
    [activities],
  )

  // transport polylines (existing)
  const segments = useMemo<Segment[]>(() => {
    const result: Segment[] = []
    for (let i = 0; i < activities.length; i++) {
      const a = activities[i]
      if (a.type !== 'transport') continue
      let prev: POI | undefined; let next: POI | undefined
      for (let j = i - 1; j >= 0; j--) { if (activities[j].poi) { prev = activities[j].poi; break } }
      for (let j = i + 1; j < activities.length; j++) { if (activities[j].poi) { next = activities[j].poi; break } }
      if (!prev || !next) continue
      const mode = a.route?.mode ?? 'straight'
      const path = (mode === 'drive' && a.route?.polyline?.length) ? a.route.polyline
        : [{ lat: prev.lat, lng: prev.lng }, { lat: next.lat, lng: next.lng }]
      result.push({ path, mode })
    }
    return result
  }, [activities])

  // route ribbon: consecutive POI pairs (non-transport connections)
  const ribbonSegments = useMemo(() => {
    if (!showRoute) return []
    const pairs: { from: POI; to: POI }[] = []
    const poiActs = activities.filter((a) => a.poi)
    for (let i = 0; i < poiActs.length - 1; i++) {
      pairs.push({ from: poiActs[i].poi!, to: poiActs[i + 1].poi! })
    }
    return pairs
  }, [activities, showRoute])

  // other-day pins
  const otherDayPins = useMemo(() => {
    if (!showAllDays || !allDays) return []
    return allDays.flatMap((day, di) =>
      day.activities.filter((a) => a.poi).map((a) => ({
        activity: a,
        color: DAY_COLORS[di % DAY_COLORS.length],
        dayTitle: day.title ?? `Day ${di + 1}`,
      }))
    )
  }, [showAllDays, allDays])

  const handleAdd = useCallback(() => {
    if (!mapPOI || !onAddPOI) return
    onAddPOI(mapPOI)
    setListOpen(false)
  }, [mapPOI, onAddPOI])

  const handleAddToList = useCallback((listId: string) => {
    if (!mapPOI || !onAddToList) return
    onAddToList(mapPOI, listId)
    setListOpen(false)
  }, [mapPOI, onAddToList])

  const isAdded = !!(mapPOI?.placeId && addedPlaceIds.has(mapPOI.placeId))

  const dismissPOI = useCallback(() => {
    setMapPOI(null); setNearbyPOIs([]); setListOpen(false)
  }, [])

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
          onPOISelected={(poi) => { setMapPOI(poi); setNearbyPOIs([]); setListOpen(false) }}
          onDismiss={dismissPOI}
          onSearchPin={setSearchPin}
          onNearbyFetched={setNearbyPOIs}
          onNearbyLoading={setLoadingNearby}
        />
        <ExploreLayer
          type={exploreType}
          onPlaces={setExplorePlaces}
          onLoading={setLoadingExplore}
        />

        {/* Transport polylines */}
        {segments.map((seg, i) => (
          <Polyline key={`seg-${i}`} path={seg.path}
            strokeColor={seg.mode === 'drive' ? '#10b981' : '#3b82f6'}
            strokeOpacity={seg.mode === 'drive' ? 0.85 : 0.55}
            strokeWeight={seg.mode === 'drive' ? 4 : 2} geodesic />
        ))}

        {/* Route ribbon: light lines between all consecutive POIs */}
        {ribbonSegments.map(({ from, to }, i) => (
          <Polyline key={`ribbon-${i}`}
            path={[{ lat: from.lat, lng: from.lng }, { lat: to.lat, lng: to.lng }]}
            strokeColor="#64748b" strokeOpacity={0.3} strokeWeight={2}
          />
        ))}

        {/* Route ribbon distance labels */}
        {showRoute && ribbonSegments.map(({ from, to }, i) => {
          const km = haversineKm(from, to)
          const mid = midpoint(from, to)
          return (
            <Marker key={`dist-${i}`} position={mid}
              icon={{ url: makeLabelSvg(fmtDist(km)), anchor: new google.maps.Point(26, 10) }}
              title={fmtWalk(km)} clickable={false} />
          )
        })}

        {/* Current day activity markers */}
        {activities.map((a, idx) =>
          a.poi ? (
            <Marker key={a.id}
              position={{ lat: a.poi.lat, lng: a.poi.lng }}
              label={{ text: String(idx + 1), color: 'white', fontWeight: 'bold' }}
              onClick={() => onSelectActivity?.(a.id)}
              animation={selectedId === a.id ? google.maps.Animation.BOUNCE : undefined}
            />
          ) : null,
        )}

        {/* Other-days pins (faint) */}
        {otherDayPins.map(({ activity, color, dayTitle }) =>
          activity.poi ? (
            <Marker key={`od-${activity.id}`}
              position={{ lat: activity.poi.lat, lng: activity.poi.lng }}
              title={`${dayTitle}: ${activity.title}`}
              icon={{
                path: google.maps.SymbolPath.CIRCLE,
                scale: 6,
                fillColor: color,
                fillOpacity: 0.45,
                strokeColor: color,
                strokeWeight: 1.5,
              }}
            />
          ) : null
        )}

        {/* Explore category markers */}
        {explorePlaces.map((p, i) => (
          <Marker key={`explore-${i}`}
            position={{ lat: p.lat, lng: p.lng }}
            title={p.name}
            icon={{
              url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
                `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26"><circle cx="13" cy="13" r="11" fill="#f97316" stroke="white" stroke-width="2"/><text x="13" y="17" text-anchor="middle" font-size="11" font-family="Arial">${EXPLORE_CATS.find((c) => c.key === exploreType)?.emoji ?? '📍'}</text></svg>`
              )}`,
              scaledSize: new google.maps.Size(26, 26),
              anchor: new google.maps.Point(13, 13),
            }}
            onClick={() => setMapPOI(p)}
          />
        ))}

        {/* Search-here pin and radius circle */}
        {searchPin && (
          <>
            <Marker position={searchPin}
              title="Search here"
              icon={{ url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle cx="12" cy="12" r="10" fill="#8b5cf6" stroke="white" stroke-width="2"/></svg>')}`, scaledSize: new google.maps.Size(24, 24), anchor: new google.maps.Point(12, 12) }}
              draggable
              onDrag={(e) => e.latLng && setSearchPin({ lat: e.latLng.lat(), lng: e.latLng.lng() })}
            />
            <Circle center={searchPin} radius={500}
              strokeColor="#8b5cf6" strokeOpacity={0.6} strokeWeight={2} fillColor="#8b5cf6" fillOpacity={0.07} />
          </>
        )}

        {/* Walking radius bubble around selected POI */}
        {mapPOI && (
          <Circle center={{ lat: mapPOI.lat, lng: mapPOI.lng }} radius={walkMin * 80}
            strokeColor="#3b82f6" strokeOpacity={0.5} strokeWeight={1.5} fillColor="#3b82f6" fillOpacity={0.06} />
        )}
      </Map>

      {/* ── Map overlay controls ── */}
      <div className="absolute left-3 top-14 z-10 flex flex-col gap-1.5 print:hidden">
        {/* Category explore pills */}
        <div className="flex flex-wrap gap-1">
          {EXPLORE_CATS.map((cat) => (
            <button
              key={cat.key}
              onClick={() => { setExploreType(exploreType === cat.key ? null : cat.key); setExplorePlaces([]) }}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium shadow-md transition ${
                exploreType === cat.key
                  ? 'bg-orange-500 text-white'
                  : 'bg-white/90 text-slate-700 hover:bg-white'
              }`}
            >
              {loadingExplore && exploreType === cat.key
                ? <span className="h-2.5 w-2.5 animate-spin rounded-full border border-current border-t-transparent" />
                : <span>{cat.emoji}</span>
              }
              {cat.label}
            </button>
          ))}
        </div>

        {/* Toggle row */}
        <div className="flex gap-1">
          <button
            onClick={() => setShowRoute((v) => !v)}
            title="Toggle route ribbon"
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium shadow-md transition ${showRoute ? 'bg-sky-600 text-white' : 'bg-white/90 text-slate-600 hover:bg-white'}`}
          >
            <Route className="h-3 w-3" /> Route
          </button>
          {allDays && allDays.length > 0 && (
            <button
              onClick={() => setShowAllDays((v) => !v)}
              title="Show all days' pins"
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium shadow-md transition ${showAllDays ? 'bg-sky-600 text-white' : 'bg-white/90 text-slate-600 hover:bg-white'}`}
            >
              <Layers className="h-3 w-3" /> All days
            </button>
          )}
          {onOptimizeRoute && activities.filter((a) => a.poi).length >= 3 && (
            <button
              onClick={() => onOptimizeRoute(greedyOptimize(activities))}
              title="Optimize stop order by proximity"
              className="flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-slate-600 shadow-md transition hover:bg-amber-50 hover:text-amber-700"
            >
              <Zap className="h-3 w-3" /> Optimize
            </button>
          )}
        </div>

        {/* Search-here controls */}
        {searchPin ? (
          <div className="flex items-center gap-1 rounded-full bg-purple-600 px-2.5 py-1 text-xs font-medium text-white shadow-md">
            <span>Drag pin to search area</span>
            <button onClick={() => setSearchPin(null)} className="ml-1 opacity-70 hover:opacity-100"><X className="h-3 w-3" /></button>
          </div>
        ) : (
          <button
            onClick={() => fallbackCenter && setSearchPin(fallbackCenter)}
            className="flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-slate-600 shadow-md transition hover:bg-white"
            title="Drop a search pin"
          >
            📍 Search here
          </button>
        )}
      </div>

      {/* ── POI bottom sheet ── */}
      {mapPOI && (
        <div className="absolute bottom-0 left-0 right-0 z-10 max-h-[70%] overflow-y-auto rounded-t-2xl bg-white shadow-2xl">
          {mapPOI.photoUrl && (
            <img src={mapPOI.photoUrl} alt={mapPOI.name} className="h-36 w-full rounded-t-2xl object-cover" />
          )}
          <div className="p-4">
            {/* Header */}
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-slate-800">{mapPOI.name}</h3>
                {mapPOI.address && <p className="mt-0.5 text-xs text-slate-500">{mapPOI.address}</p>}
                {mapPOI.rating != null && (
                  <div className="mt-1 flex items-center gap-1">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    <span className="text-xs font-medium text-slate-700">{mapPOI.rating.toFixed(1)}</span>
                  </div>
                )}
              </div>
              <button onClick={dismissPOI} className="flex-shrink-0 rounded-full p-1.5 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Walking radius toggle */}
            <div className="mt-3 flex items-center gap-2">
              <span className="text-[10px] font-medium text-slate-500">Walk radius:</span>
              {[10, 20, 30].map((m) => (
                <button
                  key={m}
                  onClick={() => setWalkMin(m)}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition ${walkMin === m ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                >
                  {m}m
                </button>
              ))}
            </div>

            {/* Nearby suggestions */}
            {(loadingNearby || nearbyPOIs.length > 0) && (
              <div className="mt-3">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Nearby</p>
                {loadingNearby ? (
                  <div className="flex gap-2">
                    {[1,2,3].map((i) => <div key={i} className="h-7 w-20 animate-pulse rounded-full bg-slate-100" />)}
                  </div>
                ) : (
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {nearbyPOIs.map((p, i) => (
                      <button
                        key={i}
                        onClick={() => { setMapPOI(p); setNearbyPOIs([]) }}
                        className="flex flex-shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:border-sky-300 hover:bg-sky-50"
                      >
                        {p.name.length > 18 ? p.name.slice(0, 18) + '…' : p.name}
                        <ChevronRight className="h-3 w-3 text-slate-400" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="mt-3 flex gap-2">
              {onAddPOI && (
                <button
                  onClick={isAdded ? undefined : handleAdd}
                  disabled={isAdded}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-medium transition ${
                    isAdded ? 'bg-emerald-50 text-emerald-600' : 'bg-sky-600 text-white hover:bg-sky-700 active:bg-sky-800'
                  }`}
                >
                  {isAdded ? <><Check className="h-4 w-4" /> Added</> : <><Plus className="h-4 w-4" /> Add to day</>}
                </button>
              )}

              {/* Save to list */}
              {scratchLists && scratchLists.length > 0 && onAddToList && (
                <div className="relative">
                  <button
                    onClick={() => setListOpen((v) => !v)}
                    className="flex h-full items-center gap-1 rounded-xl border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50"
                    title="Save to list"
                  >
                    📋
                  </button>
                  {listOpen && (
                    <div className="absolute bottom-full right-0 mb-1 w-44 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                      {scratchLists.map((l) => (
                        <button
                          key={l.id}
                          onClick={() => handleAddToList(l.id)}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                        >
                          📋 {l.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MapClickHandler({
  onPOISelected, onDismiss, onSearchPin, onNearbyFetched, onNearbyLoading,
}: {
  onPOISelected: (poi: POI) => void
  onDismiss: () => void
  onSearchPin: (pos: { lat: number; lng: number }) => void
  onNearbyFetched: (pois: POI[]) => void
  onNearbyLoading: (v: boolean) => void
}) {
  const map = useMap()
  const placesLib = useMapsLibrary('places')
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchNearby = useCallback(async (lat: number, lng: number) => {
    if (!map || !placesLib) return
    onNearbyLoading(true)
    try {
      await new Promise<void>((resolve) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const svc = new (google.maps.places as any).PlacesService(map)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        svc.nearbySearch({ location: { lat, lng }, radius: 350 }, (results: any[] | null, status: string) => {
          if (status !== 'OK' || !results) { resolve(); return }
          const pois: POI[] = results.slice(0, 5).map((r) => ({
            placeId: r.place_id,
            name: r.name ?? '',
            lat: r.geometry?.location?.lat() ?? lat,
            lng: r.geometry?.location?.lng() ?? lng,
            rating: r.rating,
            category: placeTypesToCategory(r.types ?? []),
            photoUrl: r.photos?.[0]?.getUrl({ maxWidth: 200 }) ?? undefined,
          }))
          onNearbyFetched(pois)
          resolve()
        })
      })
    } catch { /* ignore */ } finally {
      onNearbyLoading(false)
    }
  }, [map, placesLib, onNearbyFetched, onNearbyLoading])

  useEffect(() => {
    if (!map || !placesLib) return

    const clickListener = map.addListener('click', async (e: google.maps.MapMouseEvent & { placeId?: string }) => {
      if (!e.placeId) { onDismiss(); return }
      ;(e as { stop?: () => void }).stop?.()
      try {
        const place = new google.maps.places.Place({ id: e.placeId })
        await place.fetchFields({ fields: ['id', 'displayName', 'location', 'formattedAddress', 'rating', 'photos', 'types'] })
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
        onPOISelected(poi)
        void fetchNearby(poi.lat, poi.lng)
      } catch (err) { console.error('POI fetch failed', err) }
    })

    // Long-press → search-here pin
    const downListener = map.addListener('mousedown', (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return
      longPressRef.current = setTimeout(() => {
        onSearchPin({ lat: e.latLng!.lat(), lng: e.latLng!.lng() })
      }, 600)
    })
    const upListener = map.addListener('mouseup', () => {
      if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null }
    })
    const dragListener = map.addListener('dragstart', () => {
      if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null }
    })

    return () => {
      google.maps.event.removeListener(clickListener)
      google.maps.event.removeListener(downListener)
      google.maps.event.removeListener(upListener)
      google.maps.event.removeListener(dragListener)
    }
  }, [map, placesLib, onPOISelected, onDismiss, onSearchPin, fetchNearby])

  return null
}

function ExploreLayer({
  type, onPlaces, onLoading,
}: {
  type: string | null
  onPlaces: (pois: POI[]) => void
  onLoading: (v: boolean) => void
}) {
  const map = useMap()
  const placesLib = useMapsLibrary('places')

  useEffect(() => {
    if (!map || !placesLib || !type) { onPlaces([]); return }
    onLoading(true)
    const center = map.getCenter()
    if (!center) { onLoading(false); return }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new (google.maps.places as any).PlacesService(map)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    svc.nearbySearch({ location: { lat: center.lat(), lng: center.lng() }, radius: 1500, type }, (results: any[] | null, status: string) => {
      onLoading(false)
      if (status !== 'OK' || !results) { onPlaces([]); return }
      onPlaces(results.slice(0, 20).map((r) => ({
        placeId: r.place_id,
        name: r.name ?? '',
        lat: r.geometry?.location?.lat() ?? center.lat(),
        lng: r.geometry?.location?.lng() ?? center.lng(),
        rating: r.rating,
        category: placeTypesToCategory(r.types ?? []),
        photoUrl: r.photos?.[0]?.getUrl({ maxWidth: 200 }) ?? undefined,
        address: r.vicinity ?? undefined,
      })))
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, placesLib, type])

  return null
}

function FitToPoints({ points, fallbackCenter }: { points: POI[]; fallbackCenter?: { lat: number; lng: number } }) {
  const map = useMap()
  const sig = points.map((p) => `${p.lat},${p.lng}`).join('|')
  useEffect(() => {
    if (!map) return
    if (points.length === 0) { if (fallbackCenter) { map.setCenter(fallbackCenter); map.setZoom(11) } return }
    if (points.length === 1) { map.setCenter({ lat: points[0].lat, lng: points[0].lng }); map.setZoom(13); return }
    const bounds = new google.maps.LatLngBounds()
    points.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }))
    map.fitBounds(bounds, 80)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, sig])
  return null
}
