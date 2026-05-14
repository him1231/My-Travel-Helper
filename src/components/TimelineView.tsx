import { Pencil } from 'lucide-react'
import type { Activity } from '@/lib/types'

const HOUR_START = 6
const HOUR_END = 23
const TOTAL_HOURS = HOUR_END - HOUR_START // 17
const HOUR_PX = 64 // height per hour in px

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + (m || 0)
}

export default function TimelineView({
  activities,
  onSelect,
  onEdit,
  selectedId,
}: {
  activities: Activity[]
  onSelect?: (id: string) => void
  onEdit?: (id: string) => void
  selectedId?: string | null
}) {
  // Only activities with a startTime can appear on the grid
  const timed = activities.filter((a) => !!a.startTime)

  const totalPx = TOTAL_HOURS * HOUR_PX

  return (
    <div className="relative flex gap-3 overflow-y-auto">
      {/* Hour ruler */}
      <div className="flex-shrink-0 select-none" style={{ height: totalPx }}>
        {Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => i + HOUR_START).map((h) => (
          <div
            key={h}
            className="flex h-16 items-start justify-end pr-2 text-xs text-slate-400"
            style={{ height: HOUR_PX }}
          >
            {String(h).padStart(2, '0')}:00
          </div>
        ))}
      </div>

      {/* Grid lines + activity blocks */}
      <div className="relative flex-1 border-l border-slate-200" style={{ height: totalPx }}>
        {/* Hour lines */}
        {Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => i).map((i) => (
          <div
            key={i}
            className="absolute left-0 right-0 border-t border-slate-100"
            style={{ top: i * HOUR_PX }}
          />
        ))}

        {/* Activity blocks */}
        {timed.map((a) => {
          const startMin = toMinutes(a.startTime!)
          const endMin = startMin + (a.durationMinutes ?? 30)
          const offsetMin = startMin - HOUR_START * 60
          const durationMin = endMin - startMin

          const top = Math.max(0, (offsetMin / 60) * HOUR_PX)
          const height = Math.max(20, (durationMin / 60) * HOUR_PX)

          // Clamp to grid
          if (offsetMin < 0 || offsetMin >= TOTAL_HOURS * 60) return null

          const isSelected = a.id === selectedId
          const typeColor =
            a.type === 'transport' ? 'bg-sky-100 border-sky-400 text-sky-800'
            : a.type === 'note' ? 'bg-amber-100 border-amber-400 text-amber-800'
            : 'bg-rose-100 border-rose-400 text-rose-800'

          return (
            <div
              key={a.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect?.(a.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(a.id) } }}
              className={`absolute left-2 right-2 cursor-pointer overflow-hidden rounded border px-2 py-1 text-left text-xs transition hover:brightness-95 ${typeColor} ${
                isSelected ? 'ring-2 ring-sky-400' : ''
              }`}
              style={{ top, height }}
              title={a.title}
            >
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{a.title}</div>
                  {height > 32 && a.startTime && (
                    <div className="opacity-70">
                      {a.startTime}
                      {a.durationMinutes ? ` · ${a.durationMinutes}m` : ''}
                    </div>
                  )}
                </div>
                {onEdit && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onEdit(a.id) }}
                    className="flex-shrink-0 rounded p-0.5 opacity-60 hover:bg-white/60 hover:opacity-100"
                    aria-label="Edit"
                    title="Edit"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
