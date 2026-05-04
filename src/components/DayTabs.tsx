import { Plus } from 'lucide-react'
import clsx from 'clsx'
import type { Day } from '@/lib/types'
import { formatDateISO } from '@/lib/utils'

export default function DayTabs({
  days, selectedId, onSelect, onAddDay,
}: {
  days: Day[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAddDay: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {days.map((d, i) => (
        <button
          key={d.id}
          onClick={() => onSelect(d.id)}
          className={clsx(
            'rounded-lg border px-3 py-1.5 text-sm transition',
            selectedId === d.id
              ? 'border-sky-500 bg-sky-50 text-sky-700'
              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
          )}
        >
          <span className="font-medium">Day {i + 1}</span>
          <span className="ml-2 text-xs text-slate-500">{formatDateISO(d.date)}</span>
        </button>
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
