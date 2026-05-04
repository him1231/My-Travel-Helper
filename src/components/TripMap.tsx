import { useEffect, useMemo } from 'react'
import { Map, Marker, useMap } from '@vis.gl/react-google-maps'
import type { Activity, POI } from '@/lib/types'

type Props = {
  activities: Activity[]
  selectedId?: string
  onSelectActivity?: (id: string) => void
  fallbackCenter?: { lat: number; lng: number }
}

export default function TripMap({ activities, selectedId, onSelectActivity, fallbackCenter }: Props) {
  const points = useMemo(
    () => activities.map((a) => a.poi).filter((p): p is POI => !!p),
    [activities],
  )

  return (
    <Map
      defaultCenter={fallbackCenter ?? { lat: 20, lng: 0 }}
      defaultZoom={fallbackCenter ? 11 : 2}
      gestureHandling="greedy"
      disableDefaultUI={false}
      style={{ width: '100%', height: '100%' }}
    >
      <FitToPoints points={points} fallbackCenter={fallbackCenter} />
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
