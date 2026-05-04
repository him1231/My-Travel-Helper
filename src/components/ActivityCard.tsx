import { Clock, MapPin, Wallet } from 'lucide-react'
import clsx from 'clsx'
import type { Activity } from '@/lib/types'
import { formatMoney } from '@/lib/utils'

export default function ActivityCard({
  activity, index, selected, onSelect,
}: {
  activity: Activity
  index: number
  selected?: boolean
  onSelect?: () => void
}) {
  const a = activity
  return (
    <div
      onClick={onSelect}
      className={clsx(
        'cursor-pointer rounded-lg border bg-white p-3 transition',
        selected ? 'border-sky-500 ring-2 ring-sky-200' : 'border-slate-200 hover:border-slate-300',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-rose-500 text-xs font-bold text-white">
          {index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-slate-900">{a.title}</div>
          {a.poi?.address && (
            <div className="mt-0.5 flex items-start gap-1 text-xs text-slate-500">
              <MapPin className="mt-0.5 h-3 w-3 flex-shrink-0" />
              <span className="truncate">{a.poi.address}</span>
            </div>
          )}
          <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-slate-500">
            {a.startTime && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {a.startTime}{a.durationMinutes ? ` · ${a.durationMinutes}m` : ''}
              </span>
            )}
            {a.cost && a.cost.amount > 0 && (
              <span className="flex items-center gap-1">
                <Wallet className="h-3 w-3" />
                {formatMoney(a.cost.amount, a.cost.currency)}
              </span>
            )}
          </div>
          {a.notes && <p className="mt-1.5 whitespace-pre-wrap text-xs text-slate-600">{a.notes}</p>}
        </div>
      </div>
    </div>
  )
}
