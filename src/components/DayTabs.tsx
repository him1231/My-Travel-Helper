import { Plus, X } from 'lucide-react'
import clsx from 'clsx'
import type { Day } from '@/lib/types'
import { formatDateISO } from '@/lib/utils'

export default function DayTabs({
  days, selectedId, onSelect, onAddDay, onRemoveDay,
}: {
  days: Day[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAddDay: () => void
  onRemoveDay?: (id: string) => void
}) {
  return (
    <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1">
      {days.map((d, i) => (
        <div key={d.id} className="group relative">
          <button
            onClick={() => onSelect(d.id)}
            className={clsx(
              'rounded-lg border py-1.5 text-sm transition',
              onRemoveDay && days.length > 1 ? 'pl-3 pr-7' : 'px-3',
              selectedId === d.id
                ? 'border-sky-500 bg-sky-50 text-sky-700'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
            )}
          >
            <span className="font-medium">Day {i + 1}</span>
            <span className="ml-2 text-xs text-slate-500">{formatDateISO(d.date)}</span>
          </button>
          {onRemoveDay && days.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); onRemoveDay(d.id) }}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 opacity-0 transition hover:text-red-500 group-hover:opacity-100"
              aria-label={`Remove day ${i + 1}`}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      ))}
      <button
        onClick={onAddDay}
        className="flex items-center gap-1 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-50"
      >
        <Plus className="h-3.5 w-3.5" />
        Add day
      </button>
    </div>
  )
}
