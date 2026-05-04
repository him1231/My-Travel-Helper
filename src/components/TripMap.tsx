import { useEffect, useMemo } from 'react'
import { Map, Marker, Polyline, useMap } from '@vis.gl/react-google-maps'
import type { Activity, POI } from '@/lib/types'

type Props = {
  activities: Activity[]
  selectedId?: string
  onSelectActivity?: (id: string) => void
  fallbackCenter?: { lat: number; lng: number }
}

type Segment = {
  path: { lat: number; lng: number }[]
  mode: 'straight' | 'drive'
}

export default function TripMap({ activities, selectedId, onSelectActivity, fallbackCenter }: Props) {
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

  return (
    <Map
      defaultCenter={fallbackCenter ?? { lat: 20, lng: 0 }}
      defaultZoom={fallbackCenter ? 11 : 2}
      gestureHandling="greedy"
      disableDefaultUI={false}
      style={{ width: '100%', height: '100%' }}
    >
      <FitToPoints points={points} fallbackCenter={fallbackCenter} />
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
  )
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
      if (fallbackCenter) {
        map.setCenter(fallbackCenter)
        map.setZoom(11)
      }
      return
    }
    if (points.length === 1) {
      map.setCenter({ lat: points[0].lat, lng: points[0].lng })
      map.setZoom(13)
      return
    }
    const bounds = new google.maps.LatLngBounds()
    points.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }))
    map.fitBounds(bounds, 80)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, signature])

  return null
}
