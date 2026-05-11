import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, useDroppable,
  useSensor, useSensors,
  type DragStartEvent, type DragOverEvent, type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Map, Marker, useApiIsLoaded, useMap } from '@vis.gl/react-google-maps'
import { ChevronDown, GripVertical, LayoutGrid, Map as MapIcon } from 'lucide-react'
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

// Drag ID prefixes to distinguish day-column / list-column drags from activity drags
const DAY_COL_PREFIX = 'daycol::'
const LIST_COL_PREFIX = 'listcol::'

// Column key: "day::<dayId>" or "list::<listId>"
type ColKey = string

function colKey(kind: 'day' | 'list', id: string): ColKey { return `${kind}::${id}` }

type Props = {
  days: Day[]
  scratchLists: ScratchList[]
  initialView?: 'kanban' | 'map'
  onMoveActivity: (
    activityId: string,
    fromKind: 'day' | 'list', fromId: string,
    toKind: 'day' | 'list', toId: string,
    toIndex?: number,
  ) => Promise<void>
  onReorderActivities?: (
    kind: 'day' | 'list', containerId: string, orderedIds: string[],
  ) => Promise<void>
  onReorderDays?: (orderedIds: string[]) => Promise<void>
  onReorderLists?: (orderedIds: string[]) => Promise<void>
  onSelectActivity?: (activityId: string, kind: 'day' | 'list', containerId: string) => void
  onSelectDay?: (dayId: string) => void
  onSelectList?: (listId: string) => void
}

export default function OverviewView({ days, scratchLists, initialView, onMoveActivity, onReorderActivities, onReorderDays, onReorderLists, onSelectActivity, onSelectDay, onSelectList }: Props) {
  const [view, setView] = useState<'kanban' | 'map'>(initialView ?? 'kanban')
  useEffect(() => { if (initialView) setView(initialView) }, [initialView])
  // activeActivityId for activity drag; activeDayId / activeListId for column drags
  const [activeActivityId, setActiveActivityId] = useState<string | null>(null)
  const [activeDayId, setActiveDayId] = useState<string | null>(null)
  const [activeListId, setActiveListId] = useState<string | null>(null)
  const isDraggingDay = useRef(false)
  const isDraggingList = useRef(false)
  const isDraggingActivity = useRef(false)
  // Watchdog: if a drag-end write hangs, snapshot suppression should not last forever
  // — otherwise local state can drift from server indefinitely.
  const dragWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const armDragWatchdog = (kind: 'activity' | 'day' | 'list') => {
    if (dragWatchdogRef.current) clearTimeout(dragWatchdogRef.current)
    dragWatchdogRef.current = setTimeout(() => {
      if (kind === 'activity') isDraggingActivity.current = false
      else if (kind === 'day') isDraggingDay.current = false
      else isDraggingList.current = false
      dragWatchdogRef.current = null
    }, 10_000)
  }
  const disarmDragWatchdog = () => {
    if (dragWatchdogRef.current) {
      clearTimeout(dragWatchdogRef.current)
      dragWatchdogRef.current = null
    }
  }
  useEffect(() => () => disarmDragWatchdog(), [])
  // Source container captured at drag start (active.id no longer encodes it,
  // because we use a stable activity.id sortable id so dnd-kit can keep
  // tracking the draggable across cross-column re-mounts during preview).
  const sourceColRef = useRef<{ kind: 'day' | 'list'; id: string } | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  // Day columns follow date order; reordering shifts content between date slots.
  const serverDayIds = useMemo(() => days.map((d) => d.id), [days])
  const serverListIds = useMemo(() => scratchLists.map((l) => l.id), [scratchLists])

  // Mirror of localDayIds so handleDragEnd always reads the latest order, not a stale closure
  const localDayIdsRef = useRef<string[]>(serverDayIds)
  const localListIdsRef = useRef<string[]>(serverListIds)

  // Local order for live drag preview — only sync from server when not dragging
  const [localDayIds, setLocalDayIds] = useState<string[]>(serverDayIds)
  const [localListIds, setLocalListIds] = useState<string[]>(serverListIds)
  const setLocalDayIdsAndRef = (ids: string[] | ((prev: string[]) => string[])) => {
    setLocalDayIds((prev) => {
      const next = typeof ids === 'function' ? ids(prev) : ids
      localDayIdsRef.current = next
      return next
    })
  }
  const setLocalListIdsAndRef = (ids: string[] | ((prev: string[]) => string[])) => {
    setLocalListIds((prev) => {
      const next = typeof ids === 'function' ? ids(prev) : ids
      localListIdsRef.current = next
      return next
    })
  }
  useEffect(() => {
    if (!isDraggingDay.current) {
      localDayIdsRef.current = serverDayIds
      setLocalDayIds(serverDayIds)
    }
  }, [serverDayIds])
  useEffect(() => {
    if (!isDraggingList.current) {
      localListIdsRef.current = serverListIds
      setLocalListIds(serverListIds)
    }
  }, [serverListIds])

  // Local activity lists per column for live drag preview
  const buildLocalColumns = () => {
    const m = new globalThis.Map<ColKey, Activity[]>()
    days.forEach((d) => m.set(colKey('day', d.id), [...d.activities]))
    scratchLists.forEach((l) => m.set(colKey('list', l.id), [...l.activities]))
    return m
  }
  const serverColumns = useMemo(buildLocalColumns, [days, scratchLists]) // eslint-disable-line react-hooks/exhaustive-deps
  const [localColumns, setLocalColumns] = useState<globalThis.Map<ColKey, Activity[]>>(serverColumns)
  useEffect(() => {
    if (!isDraggingActivity.current) setLocalColumns(serverColumns)
  }, [serverColumns])

  const dayMap = useMemo(() => new globalThis.Map(days.map((d) => [d.id, d])), [days])
  const listMap = useMemo(() => new globalThis.Map(scratchLists.map((l) => [l.id, l])), [scratchLists])

  const localOrderedDays = useMemo(
    () => localDayIds.map((id) => dayMap.get(id)).filter((d): d is Day => !!d),
    [localDayIds, dayMap],
  )
  const localOrderedLists = useMemo(
    () => localListIds.map((id) => listMap.get(id)).filter((l): l is ScratchList => !!l),
    [localListIds, listMap],
  )

  const activeActivity = useMemo(() => {
    if (!activeActivityId) return null
    for (const list of localColumns.values()) {
      const found = list.find((a) => a.id === activeActivityId)
      if (found) return found
    }
    return null
  }, [activeActivityId, localColumns])

  const activeDayData = useMemo(
    () => (activeDayId ? dayMap.get(activeDayId) ?? null : null),
    [activeDayId, dayMap],
  )

  const activeListData = useMemo(
    () => (activeListId ? listMap.get(activeListId) ?? null : null),
    [activeListId, listMap],
  )

  const handleDragStart = (e: DragStartEvent) => {
    const id = e.active.id as string
    if (id.startsWith(DAY_COL_PREFIX)) {
      isDraggingDay.current = true
      armDragWatchdog('day')
      setActiveDayId(id.slice(DAY_COL_PREFIX.length))
      return
    }
    if (id.startsWith(LIST_COL_PREFIX)) {
      isDraggingList.current = true
      armDragWatchdog('list')
      setActiveListId(id.slice(LIST_COL_PREFIX.length))
      return
    }
    // Activity drag — id is just activity.id; locate its source column
    const activityId = id
    isDraggingActivity.current = true
    armDragWatchdog('activity')
    setActiveActivityId(activityId)
    let src: { kind: 'day' | 'list'; id: string } | null = null
    for (const day of days) {
      if (day.activities.some((a) => a.id === activityId)) { src = { kind: 'day', id: day.id }; break }
    }
    if (!src) {
      for (const list of scratchLists) {
        if (list.activities.some((a) => a.id === activityId)) { src = { kind: 'list', id: list.id }; break }
      }
    }
    sourceColRef.current = src
  }

  // Resolve a drop target id into a destination column. The id is either
  // a column droppable ("day::id"/"list::id") or a stable activity.id (no "::").
  const resolveOver = (
    overId: string,
    cols: globalThis.Map<ColKey, Activity[]>,
  ): { toKind: 'day' | 'list'; toId: string; overActivityId: string | null } | null => {
    if (overId.startsWith(DAY_COL_PREFIX)) return null
    if (overId.startsWith(LIST_COL_PREFIX)) return null
    if (overId.includes('::')) {
      const [k, id] = overId.split('::')
      if (k !== 'day' && k !== 'list') return null
      return { toKind: k, toId: id, overActivityId: null }
    }
    // Activity id — find its current column
    for (const [ck, list] of cols) {
      if (list.some((a) => a.id === overId)) {
        const [k, id] = ck.split('::')
        return { toKind: k as 'day' | 'list', toId: id, overActivityId: overId }
      }
    }
    return null
  }

  // Live preview: shift columns (day-col drag) or activity positions within/across columns
  const handleDragOver = (e: DragOverEvent) => {
    const dragId = e.active.id as string
    if (!e.over) return

    // Day column reorder
    if (dragId.startsWith(DAY_COL_PREFIX)) {
      const overId = e.over.id as string
      const fromId = dragId.slice(DAY_COL_PREFIX.length)
      // Accept both daycol::id (sortable) and day::id (droppable body) as over targets
      let toId: string | null = null
      if (overId.startsWith(DAY_COL_PREFIX)) {
        toId = overId.slice(DAY_COL_PREFIX.length)
      } else if (overId.startsWith('day::') && overId.split('::').length === 2) {
        // droppable column body id is "day::<dayId>" (exactly two parts)
        toId = overId.slice('day::'.length)
      }
      if (!toId || fromId === toId) return
      setLocalDayIdsAndRef((ids) => {
        const oldIdx = ids.indexOf(fromId)
        const newIdx = ids.indexOf(toId!)
        if (oldIdx === -1 || newIdx === -1) return ids
        return arrayMove(ids, oldIdx, newIdx)
      })
      return
    }

    // List column reorder
    if (dragId.startsWith(LIST_COL_PREFIX)) {
      const overId = e.over.id as string
      const fromId = dragId.slice(LIST_COL_PREFIX.length)
      let toId: string | null = null
      if (overId.startsWith(LIST_COL_PREFIX)) {
        toId = overId.slice(LIST_COL_PREFIX.length)
      } else if (overId.startsWith('list::') && overId.split('::').length === 2) {
        toId = overId.slice('list::'.length)
      }
      if (!toId || fromId === toId) return
      setLocalListIdsAndRef((ids) => {
        const oldIdx = ids.indexOf(fromId)
        const newIdx = ids.indexOf(toId!)
        if (oldIdx === -1 || newIdx === -1) return ids
        return arrayMove(ids, oldIdx, newIdx)
      })
      return
    }

    // Activity drag — live move within or between columns.
    // dragId is just the stable activity.id (no "::").
    const activityId = dragId
    const overId = e.over.id as string
    const resolved = resolveOver(overId, localColumns)
    if (!resolved) return
    const { toKind, toId, overActivityId } = resolved
    const toCK = colKey(toKind, toId)

    setLocalColumns((prev) => {
      // Find which column currently holds the dragged item (it may have already moved)
      let sourceCK: ColKey | null = null
      let item: Activity | undefined
      for (const [ck, list] of prev) {
        const found = list.find((a) => a.id === activityId)
        if (found) { sourceCK = ck; item = found; break }
      }
      if (!sourceCK || !item) return prev

      const next = new globalThis.Map(prev)

      if (sourceCK === toCK) {
        // Same column: reorder
        const list = [...(next.get(sourceCK) ?? [])]
        const fromIdx = list.findIndex((a) => a.id === activityId)
        if (fromIdx === -1) return prev
        list.splice(fromIdx, 1)
        const toIdx = overActivityId ? list.findIndex((a) => a.id === overActivityId) : list.length
        list.splice(toIdx === -1 ? list.length : toIdx, 0, item)
        next.set(sourceCK, list)
      } else {
        // Cross-column: remove from source, insert at target position
        const fromList = (next.get(sourceCK) ?? []).filter((a) => a.id !== activityId)
        const toList = [...(next.get(toCK) ?? [])]
        const toIdx = overActivityId ? toList.findIndex((a) => a.id === overActivityId) : toList.length
        toList.splice(toIdx === -1 ? toList.length : toIdx, 0, item)
        next.set(sourceCK, fromList)
        next.set(toCK, toList)
      }
      return next
    })
  }

  const handleDragEnd = async (e: DragEndEvent) => {
    const dragId = e.active.id as string

    // Day column reorder — read from ref to get the latest order set during handleDragOver
    if (dragId.startsWith(DAY_COL_PREFIX)) {
      isDraggingDay.current = false
      disarmDragWatchdog()
      setActiveDayId(null)
      const finalIds = localDayIdsRef.current.slice()
      try {
        await onReorderDays?.(finalIds)
      } catch (err) {
        console.error(err)
        localDayIdsRef.current = serverDayIds
        setLocalDayIds(serverDayIds) // rollback
      }
      return
    }

    // List column reorder
    if (dragId.startsWith(LIST_COL_PREFIX)) {
      isDraggingList.current = false
      disarmDragWatchdog()
      setActiveListId(null)
      const finalIds = localListIdsRef.current.slice()
      try {
        await onReorderLists?.(finalIds)
      } catch (err) {
        console.error(err)
        localListIdsRef.current = serverListIds
        setLocalListIds(serverListIds) // rollback
      }
      return
    }

    // Activity drag end — keep isDraggingActivity true until write completes
    setActiveActivityId(null)
    const source = sourceColRef.current
    sourceColRef.current = null

    if (!e.over || !source) {
      isDraggingActivity.current = false
      disarmDragWatchdog()
      setLocalColumns(serverColumns)
      return
    }

    const activityId = dragId
    const overId = e.over.id as string
    const resolved = resolveOver(overId, localColumns)
    if (!resolved) {
      isDraggingActivity.current = false
      disarmDragWatchdog()
      setLocalColumns(serverColumns)
      return
    }
    const { toKind, toId } = resolved

    const fromCK = colKey(source.kind, source.id)
    const toCK = colKey(toKind, toId)
    const finalToList = localColumns.get(toCK) ?? []

    try {
      if (fromCK === toCK) {
        // Within-column reorder
        await onReorderActivities?.(source.kind, source.id, finalToList.map((a) => a.id))
      } else {
        // Cross-column move — optimistic state already applied in handleDragOver
        const toIndex = finalToList.findIndex((a) => a.id === activityId)
        await onMoveActivity(activityId, source.kind, source.id, toKind, toId, toIndex)
      }
    } catch (err) {
      console.error(err)
      setLocalColumns(serverColumns) // rollback
    } finally {
      isDraggingActivity.current = false
      disarmDragWatchdog()
    }
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
                    activities={localColumns.get(colKey('day', day.id)) ?? day.activities}
                    isDragging={activeDayId === day.id}
                    onSelectActivity={onSelectActivity}
                    onSelectDay={onSelectDay}
                  />
                ))}
              </SortableContext>
              <SortableContext
                items={localListIds.map((id) => `${LIST_COL_PREFIX}${id}`)}
                strategy={horizontalListSortingStrategy}
              >
                {localOrderedLists.map((list) => (
                  <SortableListColumn
                    key={list.id}
                    list={list}
                    activities={localColumns.get(colKey('list', list.id)) ?? list.activities}
                    isDragging={activeListId === list.id}
                    onSelectActivity={onSelectActivity}
                    onSelectList={onSelectList}
                  />
                ))}
              </SortableContext>
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
            {activeListData && !activeDayData && (
              <ListColumnCard list={activeListData} ghost />
            )}
            {activeActivity && !activeDayData && !activeListData && <ActivityChip activity={activeActivity} ghost />}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  )
}

function SortableDayColumn({
  day, dayIdx, activities, isDragging, onSelectActivity, onSelectDay,
}: {
  day: Day
  dayIdx: number
  activities: Activity[]
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
        activities={activities}
        dragHandleProps={{ ...attributes, ...listeners }}
        onSelectActivity={onSelectActivity}
        onSelectDay={onSelectDay}
      />
    </div>
  )
}

function DayColumnCard({
  day, dayIdx, activities, ghost, dragHandleProps, onSelectActivity, onSelectDay,
}: {
  day: Day
  dayIdx: number
  activities?: Activity[]
  ghost?: boolean
  dragHandleProps?: React.HTMLAttributes<HTMLElement>
  onSelectActivity?: (activityId: string, kind: 'day' | 'list', containerId: string) => void
  onSelectDay?: (dayId: string) => void
}) {
  const color = DAY_COLORS[dayIdx % DAY_COLORS.length]
  const { setNodeRef, isOver } = useDroppable({ id: `day::${day.id}` })
  const actList = activities ?? day.activities
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
            <div className="text-[10px] text-slate-400">{actList.length} stop{actList.length !== 1 ? 's' : ''}</div>
            {day.notes && (
              <div className="mt-0.5 line-clamp-2 text-[10px] italic text-slate-400">{day.notes}</div>
            )}
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <SortableContext
          items={actList.map((a) => a.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-1.5">
            {actList.map((activity) => (
              <SortableActivity
                key={activity.id}
                activity={activity}
                onSelect={() => onSelectActivity?.(activity.id, 'day', day.id)}
              />
            ))}
            {actList.length === 0 && (
              <div className="rounded-lg border border-dashed border-slate-200 py-5 text-center text-[10px] text-slate-400">
                Drop here
              </div>
            )}
          </div>
        </SortableContext>
      </div>
    </div>
  )
}

function SortableListColumn({
  list, activities, isDragging, onSelectActivity, onSelectList,
}: {
  list: ScratchList
  activities: Activity[]
  isDragging?: boolean
  onSelectActivity?: (activityId: string, kind: 'day' | 'list', containerId: string) => void
  onSelectList?: (listId: string) => void
}) {
  const { setNodeRef, attributes, listeners, transform, transition } = useSortable({
    id: `${LIST_COL_PREFIX}${list.id}`,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }
  return (
    <div ref={setNodeRef} style={style}>
      <ListColumnCard
        list={list}
        activities={activities}
        dragHandleProps={{ ...attributes, ...listeners }}
        onSelectActivity={onSelectActivity}
        onSelectList={onSelectList}
      />
    </div>
  )
}

function ListColumnCard({
  list, activities, ghost, dragHandleProps, onSelectActivity, onSelectList,
}: {
  list: ScratchList
  activities?: Activity[]
  ghost?: boolean
  dragHandleProps?: React.HTMLAttributes<HTMLElement>
  onSelectActivity?: (activityId: string, kind: 'day' | 'list', containerId: string) => void
  onSelectList?: (listId: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `list::${list.id}` })
  const actList = activities ?? list.activities
  return (
    <div
      ref={setNodeRef}
      className={`flex w-56 flex-shrink-0 flex-col rounded-xl border transition-colors ${
        ghost ? 'rotate-2 shadow-2xl border-amber-400 bg-amber-50' : isOver ? 'border-amber-400 bg-amber-50' : 'border-amber-200 bg-amber-50/40'
      }`}
    >
      <div className="rounded-t-xl border-b border-amber-200 bg-amber-50">
        <div className="flex items-center gap-1 px-2 pt-2">
          <button
            {...dragHandleProps}
            className="cursor-grab touch-none rounded p-0.5 text-amber-400 hover:text-amber-600 active:cursor-grabbing focus:outline-none"
            title="Drag to reorder list"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          <div
            className={`flex-1 min-w-0 pb-1.5 ${onSelectList ? 'cursor-pointer hover:opacity-80' : ''}`}
            onClick={onSelectList ? () => onSelectList(list.id) : undefined}
            title={onSelectList ? 'Open list detail' : undefined}
          >
            <div className="flex items-center gap-1">
              <span className="text-xs">📋</span>
              <div className="truncate text-xs font-semibold text-amber-800">{list.name}</div>
            </div>
            <div className="text-[10px] text-amber-600">{actList.length} item{actList.length !== 1 ? 's' : ''}</div>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <SortableContext
          items={actList.map((a) => a.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-1.5">
            {actList.map((activity) => (
              <SortableActivity
                key={activity.id}
                activity={activity}
                onSelect={() => onSelectActivity?.(activity.id, 'list', list.id)}
              />
            ))}
            {actList.length === 0 && (
              <div className="rounded-lg border border-dashed border-amber-200 py-5 text-center text-[10px] text-amber-400">
                Drop here
              </div>
            )}
          </div>
        </SortableContext>
      </div>
    </div>
  )
}

function SortableActivity({
  activity, onSelect,
}: {
  activity: Activity
  onSelect: () => void
}) {
  // Use stable activity.id so dnd-kit can keep tracking the draggable
  // when the live preview re-mounts it under a different column.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: activity.id,
  })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
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
      {(activity.startTime || activity.durationMinutes) && (
        <div className="mt-0.5 pl-4 text-[10px] text-slate-400">
          {activity.startTime}
          {activity.startTime && activity.durationMinutes ? ' · ' : ''}
          {activity.durationMinutes ? `${activity.durationMinutes}m` : ''}
        </div>
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
  // Legend collapsed on mobile by default, expanded on md+
  const [legendOpen, setLegendOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true,
  )

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
        <div className="absolute bottom-8 left-2 z-10 flex max-h-64 max-w-[60vw] flex-col rounded-lg bg-white/95 shadow-lg backdrop-blur-sm md:max-w-none">
          <button
            onClick={() => setLegendOpen((v) => !v)}
            className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50"
          >
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Show on map</span>
            <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${legendOpen ? '' : '-rotate-90'}`} />
          </button>
          {legendOpen && (
          <div className="overflow-y-auto px-2 pb-2">
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
