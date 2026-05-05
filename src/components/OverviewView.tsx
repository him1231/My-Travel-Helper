import { useEffect, useMemo, useState } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable,
  useSensor, useSensors,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core'
import { Map, Marker, useMap } from '@vis.gl/react-google-maps'
import { LayoutGrid, Map as MapIcon } from 'lucide-react'
import type { Activity, Day, ScratchList } from '@/lib/types'
import { formatDateISO } from '@/lib/utils'

const DAY_COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899','#14b8a6']
const LIST_COLOR = '#94a3b8'

function makePinSvg(color: string, label: string): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="38" viewBox="0 0 28 38"><path fill="${color}" stroke="white" stroke-width="1.5" d="M14 1C7.4 1 2 6.4 2 13c0 9.5 12 24 12 24s12-14.5 12-24c0-6.6-5.4-12-12-12z"/><text x="14" y="17" text-anchor="middle" dominant-baseline="middle" font-size="11" font-weight="bold" fill="white" font-family="Arial,sans-serif">${label}</text></svg>`
  )}`
}

type Props = {
  days: Day[]
  scratchLists: ScratchList[]
  onMoveActivity: (
    activityId: string,
    fromKind: 'day' | 'list', fromId: string,
    toKind: 'day' | 'list', toId: string,
  ) => Promise<void>
  onSelectActivity?: (activityId: string, kind: 'day' | 'list', containerId: string) => void
}

export default function OverviewView({ days, scratchLists, onMoveActivity, onSelectActivity }: Props) {
  const [view, setView] = useState<'kanban' | 'map'>('kanban')
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const activeActivity = useMemo(() => {
    if (!activeKey) return null
    const [kind, containerId, activityId] = activeKey.split('::')
    const container = kind === 'day'
      ? days.find((d) => d.id === containerId)
      : scratchLists.find((l) => l.id === containerId)
    return container?.activities.find((a) => a.id === activityId) ?? null
  }, [activeKey, days, scratchLists])

  const handleDragStart = (e: DragStartEvent) => setActiveKey(e.active.id as string)

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveKey(null)
    if (!e.over || !e.active) return
    const [fromKind, fromId, activityId] = (e.active.id as string).split('::')
    const [toKind, toId] = (e.over.id as string).split('::')
    if (fromKind === toKind && fromId === toId) return
    await onMoveActivity(activityId, fromKind as 'day' | 'list', fromId, toKind as 'day' | 'list', toId)
  }

  return (
    <div className="flex h-full flex-col">
      {/* view toggle */}
      <div className="flex flex-shrink-0 items-center justify-end gap-1 border-b border-slate-200 bg-white px-4 py-2">
        <button
          onClick={() => setView('kanban')}
          className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${view === 'kanban' ? 'bg-sky-50 text-sky-700' : 'text-slate-500 hover:bg-slate-100'}`}
        >
          <LayoutGrid className="h-3.5 w-3.5" /> Kanban
        </button>
        <button
          onClick={() => setView('map')}
          className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${view === 'map' ? 'bg-sky-50 text-sky-700' : 'text-slate-500 hover:bg-slate-100'}`}
        >
          <MapIcon className="h-3.5 w-3.5" /> Map
        </button>
      </div>

      {view === 'map' ? (
        <div className="relative flex-1">
          <OverviewMap days={days} scratchLists={scratchLists} />
        </div>
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          {/* outer scrolls; inner is centered when content fits */}
          <div className="flex flex-1 overflow-x-auto">
            <div className="mx-auto flex min-w-min gap-3 p-4">
              {days.map((day, dayIdx) => (
                <DayColumn key={day.id} day={day} dayIdx={dayIdx} onSelectActivity={onSelectActivity} />
              ))}
              {scratchLists.map((list) => (
                <ListColumn key={list.id} list={list} onSelectActivity={onSelectActivity} />
              ))}
              {days.length === 0 && scratchLists.length === 0 && (
                <div className="flex items-center justify-center p-8 text-sm text-slate-400">
                  No days yet — add a day to get started.
                </div>
              )}
            </div>
          </div>
          <DragOverlay dropAnimation={null}>
            {activeActivity && <ActivityChip activity={activeActivity} ghost />}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  )
}

function DayColumn({
  day, dayIdx, onSelectActivity,
}: {
  day: Day
  dayIdx: number
  onSelectActivity?: (activityId: string, kind: 'day' | 'list', containerId: string) => void
}) {
  const color = DAY_COLORS[dayIdx % DAY_COLORS.length]
  const { setNodeRef, isOver } = useDroppable({ id: `day::${day.id}` })
  return (
    <div
      ref={setNodeRef}
      className={`flex w-56 flex-shrink-0 flex-col rounded-xl border transition-colors ${isOver ? 'border-sky-400 bg-sky-50' : 'border-slate-200 bg-white'}`}
    >
      <div
        className="rounded-t-xl border-b border-slate-100 px-3 py-2.5"
        style={{ borderTop: `3px solid ${color}` }}
      >
        <div className="text-xs font-semibold text-slate-800">{formatDateISO(day.date)}</div>
        <div className="text-[10px] text-slate-400">{day.activities.length} stop{day.activities.length !== 1 ? 's' : ''}</div>
      </div>
      <div className="flex-1 space-y-1.5 overflow-y-auto p-2">
        {day.activities.map((activity) => (
          <DraggableActivity
            key={activity.id}
            activity={activity}
            kind="day"
            containerId={day.id}
            onSelect={() => onSelectActivity?.(activity.id, 'day', day.id)}
          />
        ))}
        {day.activities.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-200 py-5 text-center text-[10px] text-slate-400">
            Drop here
          </div>
        )}
      </div>
    </div>
  )
}

function ListColumn({
  list, onSelectActivity,
}: {
  list: ScratchList
  onSelectActivity?: (activityId: string, kind: 'day' | 'list', containerId: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `list::${list.id}` })
  return (
    <div
      ref={setNodeRef}
      className={`flex w-56 flex-shrink-0 flex-col rounded-xl border transition-colors ${isOver ? 'border-amber-400 bg-amber-50' : 'border-amber-200 bg-amber-50/40'}`}
    >
      <div className="rounded-t-xl border-b border-amber-200 bg-amber-50 px-3 py-2.5">
        <div className="flex items-center gap-1">
          <span className="text-xs">📋</span>
          <div className="truncate text-xs font-semibold text-amber-800">{list.name}</div>
        </div>
        <div className="text-[10px] text-amber-600">{list.activities.length} item{list.activities.length !== 1 ? 's' : ''}</div>
      </div>
      <div className="flex-1 space-y-1.5 overflow-y-auto p-2">
        {list.activities.map((activity) => (
          <DraggableActivity
            key={activity.id}
            activity={activity}
            kind="list"
            containerId={list.id}
            onSelect={() => onSelectActivity?.(activity.id, 'list', list.id)}
          />
        ))}
        {list.activities.length === 0 && (
          <div className="rounded-lg border border-dashed border-amber-200 py-5 text-center text-[10px] text-amber-400">
            Drop here
          </div>
        )}
      </div>
    </div>
  )
}

function DraggableActivity({
  activity, kind, containerId, onSelect,
}: {
  activity: Activity
  kind: 'day' | 'list'
  containerId: string
  onSelect: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `${kind}::${containerId}::${activity.id}`,
  })
  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)` } : undefined}
      {...listeners}
      {...attributes}
      onClick={onSelect}
      className={`cursor-grab rounded-lg border border-slate-200 bg-white px-2.5 py-2 shadow-sm transition hover:border-sky-300 hover:shadow active:cursor-grabbing ${isDragging ? 'opacity-30' : ''}`}
    >
      <ActivityChip activity={activity} />
    </div>
  )
}

function ActivityChip({ activity, ghost }: { activity: Activity; ghost?: boolean }) {
  const icon = activity.type === 'poi' ? '📍' : activity.type === 'transport' ? '🚌' : '📝'
  return (
    <div className={ghost ? 'rounded-lg border border-sky-300 bg-white px-2.5 py-2 shadow-lg' : ''}>
      <div className="flex items-center gap-1">
        <span className="text-xs">{icon}</span>
        <span className="truncate text-xs font-medium text-slate-700">{activity.title}</span>
      </div>
      {activity.startTime && (
        <div className="mt-0.5 pl-4 text-[10px] text-slate-400">{activity.startTime}</div>
      )}
    </div>
  )
}

// ── Overview map ───────────────────────────────────────────────────────────

function OverviewMap({ days, scratchLists }: { days: Day[]; scratchLists: ScratchList[] }) {
  const allPoints = useMemo(() => {
    const pts: { lat: number; lng: number }[] = []
    days.forEach((d) => d.activities.forEach((a) => { if (a.poi) pts.push({ lat: a.poi.lat, lng: a.poi.lng }) }))
    scratchLists.forEach((l) => l.activities.forEach((a) => { if (a.poi) pts.push({ lat: a.poi.lat, lng: a.poi.lng }) }))
    return pts
  }, [days, scratchLists])

  return (
    <Map defaultCenter={{ lat: 20, lng: 0 }} defaultZoom={2} gestureHandling="greedy" style={{ width: '100%', height: '100%' }}>
      <FitAllPoints points={allPoints} />
      <OverviewMarkers days={days} scratchLists={scratchLists} />
      {(days.length > 0 || scratchLists.length > 0) && (
        <div className="absolute bottom-8 left-2 z-10 max-h-52 overflow-y-auto rounded-lg bg-white/90 p-2 shadow-lg backdrop-blur-sm">
          {days.map((day, i) => (
            <div key={day.id} className="flex items-center gap-1.5 py-0.5">
              <span className="inline-block h-3 w-3 flex-shrink-0 rounded-full" style={{ backgroundColor: DAY_COLORS[i % DAY_COLORS.length] }} />
              <span className="text-[11px] text-slate-700">{formatDateISO(day.date)}</span>
            </div>
          ))}
          {scratchLists.map((list) => (
            <div key={list.id} className="flex items-center gap-1.5 py-0.5">
              <span className="inline-block h-3 w-3 flex-shrink-0 rounded-full" style={{ backgroundColor: LIST_COLOR }} />
              <span className="text-[11px] text-slate-500">📋 {list.name}</span>
            </div>
          ))}
        </div>
      )}
    </Map>
  )
}

function OverviewMarkers({ days, scratchLists }: { days: Day[]; scratchLists: ScratchList[] }) {
  const map = useMap()
  if (!map) return null
  return (
    <>
      {days.map((day, dayIdx) => {
        const color = DAY_COLORS[dayIdx % DAY_COLORS.length]
        return day.activities.map((activity, actIdx) =>
          activity.poi ? (
            <Marker
              key={`${day.id}-${activity.id}`}
              position={{ lat: activity.poi.lat, lng: activity.poi.lng }}
              icon={{
                url: makePinSvg(color, String(actIdx + 1)),
                scaledSize: new google.maps.Size(28, 38),
                anchor: new google.maps.Point(14, 38),
              }}
              title={`${formatDateISO(day.date)}: ${activity.title}`}
            />
          ) : null
        )
      })}
      {scratchLists.map((list) =>
        list.activities.map((activity, actIdx) =>
          activity.poi ? (
            <Marker
              key={`${list.id}-${activity.id}`}
              position={{ lat: activity.poi.lat, lng: activity.poi.lng }}
              icon={{
                url: makePinSvg(LIST_COLOR, String(actIdx + 1)),
                scaledSize: new google.maps.Size(28, 38),
                anchor: new google.maps.Point(14, 38),
              }}
              title={`${list.name}: ${activity.title}`}
            />
          ) : null
        )
      )}
    </>
  )
}

function FitAllPoints({ points }: { points: { lat: number; lng: number }[] }) {
  const map = useMap()
  const sig = points.map((p) => `${p.lat},${p.lng}`).join('|')
  useEffect(() => {
    if (!map || points.length === 0) return
    if (points.length === 1) { map.setCenter(points[0]); map.setZoom(13); return }
    const bounds = new google.maps.LatLngBounds()
    points.forEach((p) => bounds.extend(p))
    map.fitBounds(bounds, 80)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, sig])
  return null
}
