import { useState, useMemo } from 'react'
import {
  DndContext, DragOverlay, useDraggable, useDroppable,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core'
import type { Activity, Day } from '@/lib/types'
import { formatDateISO } from '@/lib/utils'

type Props = {
  days: Day[]
  onMoveActivity: (activityId: string, fromDayId: string, toDayId: string) => Promise<void>
  onSelectActivity?: (activityId: string, dayId: string) => void
}

export default function OverviewView({ days, onMoveActivity, onSelectActivity }: Props) {
  const [activeKey, setActiveKey] = useState<string | null>(null)

  const activeActivity = useMemo(() => {
    if (!activeKey) return null
    const [dayId, activityId] = activeKey.split('::')
    return days.find((d) => d.id === dayId)?.activities.find((a) => a.id === activityId) ?? null
  }, [activeKey, days])

  const handleDragStart = (e: DragStartEvent) => {
    setActiveKey(e.active.id as string)
  }

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveKey(null)
    if (!e.over || !e.active) return
    const [fromDayId, activityId] = (e.active.id as string).split('::')
    const toDayId = e.over.id as string
    if (fromDayId === toDayId) return
    await onMoveActivity(activityId, fromDayId, toDayId)
  }

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex h-full gap-3 overflow-x-auto p-4">
        {days.map((day) => (
          <DayColumn key={day.id} day={day} onSelectActivity={onSelectActivity} />
        ))}
        {days.length === 0 && (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
            No days yet — add a day to get started.
          </div>
        )}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeActivity && <ActivityChip activity={activeActivity} ghost />}
      </DragOverlay>
    </DndContext>
  )
}

function DayColumn({
  day,
  onSelectActivity,
}: {
  day: Day
  onSelectActivity?: (activityId: string, dayId: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: day.id })

  return (
    <div
      ref={setNodeRef}
      className={`flex w-56 flex-shrink-0 flex-col rounded-xl border transition-colors ${
        isOver ? 'border-sky-400 bg-sky-50' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="border-b border-slate-100 px-3 py-2.5">
        <div className="text-xs font-semibold text-slate-800">{formatDateISO(day.date)}</div>
        <div className="text-[10px] text-slate-400">{day.activities.length} stop{day.activities.length !== 1 ? 's' : ''}</div>
      </div>
      <div className="flex-1 space-y-1.5 overflow-y-auto p-2">
        {day.activities.map((activity) => (
          <DraggableActivity
            key={activity.id}
            activity={activity}
            dayId={day.id}
            onSelect={() => onSelectActivity?.(activity.id, day.id)}
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

function DraggableActivity({
  activity,
  dayId,
  onSelect,
}: {
  activity: Activity
  dayId: string
  onSelect: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `${dayId}::${activity.id}`,
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
