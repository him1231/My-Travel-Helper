import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable,
  useSensor, useSensors,
  type DragStartEvent, type DragOverEvent, type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Map, Marker, useApiIsLoaded, useMap } from '@vis.gl/react-google-maps'
import { GripVertical, LayoutGrid, Map as MapIcon } from 'lucide-react'
import type { Activity, Day, ScratchList } from '@/lib/types'
import { formatDateISO } from '@/lib/utils'
import { useMapsAuthFailed } from '@/lib/mapsStatus'
import MapErrorBoundary from '@/components/MapErrorBoundary'

const DAY_COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899','#14b8a6']
const LIST_COLOR = '#94a3b8'

function makePinSvg(color: string, label: string): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="38" viewBox="0 0 28 38"><path fill="${color}" stroke="white" stroke-width="1.5" d="M14 1C7.4 1 2 6.4 2 13c0 9.5 12 24 12 24s12-14.5 12-24c0-6.6-5.4-12-12-12z"/><text x="14" y="17" text-anchor="middle" dominant-baseline="middle" font-size="11" font-weight="bold" fill="white" font-family="Arial,sans-serif">${label}</text></svg>`
  )}`
}

// Drag ID prefixes to distinguish day-column drags from activity drags
const DAY_COL_PREFIX = 'daycol::'

type Props = {
  days: Day[]
  scratchLists: ScratchList[]
  dayOrder?: string[] // custom column order (day IDs)
  initialView?: 'kanban' | 'map'
  onMoveActivity: (
    activityId: string,
    fromKind: 'day' | 'list', fromId: string,
    toKind: 'day' | 'list', toId: string,
  ) => Promise<void>
  onReorderDays?: (orderedIds: string[]) => Promise<void>
  onSelectActivity?: (activityId: string, kind: 'day' | 'list', containerId: string) => void
  onSelectDay?: (dayId: string) => void
  onSelectList?: (listId: string) => void
}

export default function OverviewView({ days, scratchLists, dayOrder, initialView, onMoveActivity, onReorderDays, onSelectActivity, onSelectDay, onSelectList }: Props) {
  const [view, setView] = useState<'kanban' | 'map'>(initialView ?? 'kanban')
  useEffect(() => { if (initialView) setView(initialView) }, [initialView])
  // activeKey for activity drag; activeDayId for day column drag
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [activeDayId, setActiveDayId] = useState<string | null>(null)
  const isDraggingDay = useRef(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  // Apply custom order if provided, otherwise keep date order
  const serverDayIds = useMemo(() => {
    if (!dayOrder || dayOrder.length === 0) {
      return days.map((d) => d.id)
    }
    const dayMap = new globalThis.Map(days.map((d) => [d.id, d]))
    const sorted = dayOrder.map((id) => dayMap.get(id)).filter((d): d is Day => !!d).map((d) => d.id)
    const inOrder = new globalThis.Set(dayOrder)
    days.forEach((d) => { if (!inOrder.has(d.id)) sorted.push(d.id) })
    return sorted
  }, [days, dayOrder])

  // Local order for live drag preview — only sync from server when not dragging
  const [localDayIds, setLocalDayIds] = useState<string[]>(serverDayIds)
  useEffect(() => {
    if (!isDraggingDay.current) {
      setLocalDayIds(serverDayIds)
    }
  }, [serverDayIds])

  const dayMap = useMemo(() => new globalThis.Map(days.map((d) => [d.id, d])), [days])

  const localOrderedDays = useMemo(
    () => localDayIds.map((id) => dayMap.get(id)).filter((d): d is Day => !!d),
    [localDayIds, dayMap],
  )

  const activeActivity = useMemo(() => {
    if (!activeKey) return null
    const [kind, containerId, activityId] = activeKey.split('::')
    const container = kind === 'day'
      ? days.find((d) => d.id === containerId)
      : scratchLists.find((l) => l.id === containerId)
    return container?.activities.find((a) => a.id === activityId) ?? null
  }, [activeKey, days, scratchLists])

  const activeDayData = useMemo(
    () => (activeDayId ? dayMap.get(activeDayId) ?? null : null),
    [activeDayId, dayMap],
  )

  const handleDragStart = (e: DragStartEvent) => {
    const id = e.active.id as string
    if (id.startsWith(DAY_COL_PREFIX)) {
      isDraggingDay.current = true
      setActiveDayId(id.slice(DAY_COL_PREFIX.length))
    } else {
      setActiveKey(id)
    }
  }

  // Live preview: shift columns as user drags over them
  const handleDragOver = (e: DragOverEvent) => {
    const dragId = e.active.id as string
    if (!dragId.startsWith(DAY_COL_PREFIX)) return
    if (!e.over) return
    const overId = e.over.id as string
    if (!overId.startsWith(DAY_COL_PREFIX)) return
    const fromId = dragId.slice(DAY_COL_PREFIX.length)
    const toId = overId.slice(DAY_COL_PREFIX.length)
    if (fromId === toId) return
    setLocalDayIds((ids) => {
      const oldIdx = ids.indexOf(fromId)
      const newIdx = ids.indexOf(toId)
      if (oldIdx === -1 || newIdx === -1) return ids
      return arrayMove(ids, oldIdx, newIdx)
    })
  }

  const handleDragEnd = async (e: DragEndEvent) => {
    const dragId = e.active.id as string

    // Day column reorder — localDayIds is already in final order from handleDragOver
    if (dragId.startsWith(DAY_COL_PREFIX)) {
      isDraggingDay.current = false
      setActiveDayId(null)
      // localDayIds holds the final desired order; persist it
      const finalIds = localDayIds.slice()
      try {
        await onReorderDays?.(finalIds)
      } catch (err) {
        console.error(err)
        setLocalDayIds(serverDayIds) // rollback
      }
      return
    }

    // Activity cross-column move
    setActiveKey(null)
    if (!e.over || !e.active) return
    const [fromKind, fromId, activityId] = dragId.split('::')
    const overId = e.over.id as string
    if (overId.startsWith(DAY_COL_PREFIX)) return
    const [toKind, toId] = overId.split('::')
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
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
          {/* outer scrolls; inner is centered when content fits */}
          <div className="flex flex-1 overflow-x-auto">
            <div className="mx-auto flex min-w-min gap-3 p-4">
              <SortableContext
                items={localDayIds.map((id) => `${DAY_COL_PREFIX}${id}`)}
                strategy={horizontalListSortingStrategy}
              >
                {localOrderedDays.map((day, dayIdx) => (
                  <SortableDayColumn
                    key={day.id}
                    day={day}
                    dayIdx={dayIdx}
                    isDragging={activeDayId === day.id}
                    onSelectActivity={onSelectActivity}
                    onSelectDay={onSelectDay}
                  />
                ))}
              </SortableContext>
              {scratchLists.map((list) => (
                <ListColumn key={list.id} list={list} onSelectActivity={onSelectActivity} onSelectList={onSelectList} />
              ))}
              {days.length === 0 && scratchLists.length === 0 && (
                <div className="flex items-center justify-center p-8 text-sm text-slate-400">
                  No days yet — add a day to get started.
                </div>
              )}
            </div>
          </div>
          <DragOverlay dropAnimation={null}>
            {activeDayData && (
              <DayColumnCard day={activeDayData} dayIdx={localDayIds.indexOf(activeDayData.id)} ghost />
            )}
            {activeActivity && !activeDayData && <ActivityChip activity={activeActivity} ghost />}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  )
}

function SortableDayColumn({
  day, dayIdx, isDragging, onSelectActivity, onSelectDay,
}: {
  day: Day
  dayIdx: number
  isDragging?: boolean
  onSelectActivity?: (activityId: string, kind: 'day' | 'list', containerId: string) => void
  onSelectDay?: (dayId: string) => void
}) {
  const { setNodeRef, attributes, listeners, transform, transition } = useSortable({
    id: `${DAY_COL_PREFIX}${day.id}`,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }
  return (
    <div ref={setNodeRef} style={style}>
      <DayColumnCard
        day={day}
        dayIdx={dayIdx}
        dragHandleProps={{ ...attributes, ...listeners }}
        onSelectActivity={onSelectActivity}
        onSelectDay={onSelectDay}
      />
    </div>
  )
}

function DayColumnCard({
  day, dayIdx, ghost, dragHandleProps, onSelectActivity, onSelectDay,
}: {
  day: Day
  dayIdx: number
  ghost?: boolean
  dragHandleProps?: React.HTMLAttributes<HTMLElement>
  onSelectActivity?: (activityId: string, kind: 'day' | 'list', containerId: string) => void
  onSelectDay?: (dayId: string) => void
}) {
  const color = DAY_COLORS[dayIdx % DAY_COLORS.length]
  const { setNodeRef, isOver } = useDroppable({ id: `day::${day.id}` })
  return (
    <div
      ref={setNodeRef}
      className={`flex w-56 flex-shrink-0 flex-col rounded-xl border transition-colors ${
        ghost ? 'rotate-2 shadow-2xl border-sky-300 bg-sky-50' : isOver ? 'border-sky-400 bg-sky-50' : 'border-slate-200 bg-white'
      }`}
    >
      <div
        className="rounded-t-xl border-b border-slate-100"
        style={{ borderTop: `3px solid ${color}` }}
      >
        {/* Drag handle row */}
        <div className="flex items-center gap-1 px-2 pt-2">
          <button
            {...dragHandleProps}
            className="cursor-grab touch-none rounded p-0.5 text-slate-300 hover:text-slate-500 active:cursor-grabbing focus:outline-none"
            title="Drag to reorder day"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          <div
            className={`flex-1 min-w-0 pb-1 ${onSelectDay ? 'cursor-pointer hover:opacity-80' : ''}`}
            onClick={onSelectDay ? () => onSelectDay(day.id) : undefined}
            title={onSelectDay ? 'Open day detail' : undefined}
          >
            {day.title && <div className="truncate text-[11px] font-bold text-slate-700">{day.title}</div>}
            <div className="text-xs font-semibold text-slate-800">{formatDateISO(day.date)}</div>
            <div className="text-[10px] text-slate-400">{day.activities.length} stop{day.activities.length !== 1 ? 's' : ''}</div>
            {day.notes && (
              <div className="mt-0.5 line-clamp-2 text-[10px] italic text-slate-400">{day.notes}</div>
            )}
          </div>
        </div>
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
  list, onSelectActivity, onSelectList,
}: {
  list: ScratchList
  onSelectActivity?: (activityId: string, kind: 'day' | 'list', containerId: string) => void
  onSelectList?: (listId: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `list::${list.id}` })
  return (
    <div
      ref={setNodeRef}
      className={`flex w-56 flex-shrink-0 flex-col rounded-xl border transition-colors ${isOver ? 'border-amber-400 bg-amber-50' : 'border-amber-200 bg-amber-50/40'}`}
    >
      <div
        className={`rounded-t-xl border-b border-amber-200 bg-amber-50 px-3 py-2.5 ${onSelectList ? 'cursor-pointer hover:bg-amber-100' : ''}`}
        onClick={onSelectList ? () => onSelectList(list.id) : undefined}
        title={onSelectList ? 'Open list detail' : undefined}
      >
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
  const apiLoaded = useApiIsLoaded()
  const authFailed = useMapsAuthFailed()

  // visibility: key = day.id or list.id, value = visible (default true)
  const [hidden, setHidden] = useState<globalThis.Set<string>>(new globalThis.Set())

  const toggle = (id: string) => {
    setHidden((prev) => {
      const next = new globalThis.Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const visiblePoints = useMemo(() => {
    const pts: { lat: number; lng: number }[] = []
    days.forEach((d) => { if (!hidden.has(d.id)) d.activities.forEach((a) => { if (a.poi) pts.push({ lat: a.poi.lat, lng: a.poi.lng }) }) })
    scratchLists.forEach((l) => { if (!hidden.has(l.id)) l.activities.forEach((a) => { if (a.poi) pts.push({ lat: a.poi.lat, lng: a.poi.lng }) }) })
    return pts
  }, [days, scratchLists, hidden])

  if (authFailed) {
    return (
      <div className="grid h-full w-full place-items-center bg-slate-50 p-4 text-center text-sm text-slate-500">
        Map unavailable — Google Maps API key is not authorized for this domain.
      </div>
    )
  }

  if (!apiLoaded) {
    return (
      <div className="grid h-full w-full place-items-center bg-slate-50 text-sm text-slate-400">
        Loading map…
      </div>
    )
  }

  return (
    <MapErrorBoundary>
    <Map defaultCenter={{ lat: 20, lng: 0 }} defaultZoom={2} gestureHandling="greedy" style={{ width: '100%', height: '100%' }}>
      <FitAllPoints points={visiblePoints} />
      <OverviewMarkers days={days} scratchLists={scratchLists} hidden={hidden} />
      {(days.length > 0 || scratchLists.length > 0) && (
        <div className="absolute bottom-8 left-2 z-10 max-h-64 overflow-y-auto rounded-lg bg-white/95 p-2 shadow-lg backdrop-blur-sm">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Show on map</p>
          {days.map((day, i) => {
            const visible = !hidden.has(day.id)
            const color = DAY_COLORS[i % DAY_COLORS.length]
            return (
              <label key={day.id} className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={visible}
                  onChange={() => toggle(day.id)}
                  className="h-3 w-3 flex-shrink-0 rounded"
                  style={{ accentColor: color }}
                />
                <span className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: color }} />
                <span className={`text-[11px] ${visible ? 'text-slate-700' : 'text-slate-400 line-through'}`}>
                  {day.title ? `${day.title} · ` : ''}{formatDateISO(day.date)}
                </span>
              </label>
            )
          })}
          {scratchLists.length > 0 && days.length > 0 && (
            <div className="my-1 border-t border-slate-100" />
          )}
          {scratchLists.map((list) => {
            const visible = !hidden.has(list.id)
            return (
              <label key={list.id} className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={visible}
                  onChange={() => toggle(list.id)}
                  className="h-3 w-3 flex-shrink-0 rounded"
                  style={{ accentColor: LIST_COLOR }}
                />
                <span className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: LIST_COLOR }} />
                <span className={`text-[11px] ${visible ? 'text-slate-500' : 'text-slate-300 line-through'}`}>
                  📋 {list.name}
                </span>
              </label>
            )
          })}
        </div>
      )}
    </Map>
    </MapErrorBoundary>
  )
}

function OverviewMarkers({ days, scratchLists, hidden }: { days: Day[]; scratchLists: ScratchList[]; hidden: globalThis.Set<string> }) {
  const map = useMap()
  if (!map) return null
  return (
    <>
      {days.map((day, dayIdx) => {
        if (hidden.has(day.id)) return null
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
      {scratchLists.map((list) => {
        if (hidden.has(list.id)) return null
        return list.activities.map((activity, actIdx) =>
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
      })}
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
