import { Clock, GripVertical, MapPin, StickyNote, Truck, Wallet } from 'lucide-react'
import clsx from 'clsx'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Activity } from '@/lib/types'
import { formatMoney } from '@/lib/utils'

const TYPE_STYLES: Record<string, { badge: string; border: string }> = {
  poi: { badge: 'bg-rose-500', border: '' },
  note: { badge: 'bg-amber-400', border: 'border-amber-100 bg-amber-50' },
  transport: { badge: 'bg-sky-500', border: 'border-sky-100 bg-sky-50' },
}

export default function ActivityCard({
  activity, index, selected, onSelect,
}: {
  activity: Activity
  index: number
  selected?: boolean
  onSelect?: () => void
}) {
  const a = activity
  const style_info = TYPE_STYLES[a.type] ?? TYPE_STYLES.poi
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: a.id })

  const dndStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={dndStyle}
      onClick={onSelect}
      className={clsx(
        'cursor-pointer rounded-lg border p-3 transition',
        selected ? 'border-sky-500 ring-2 ring-sky-200' : `border-slate-200 hover:border-slate-300 ${style_info.border}`,
      )}
    >
      <div className="flex items-start gap-3">
        <button
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5 flex-shrink-0 cursor-grab touch-none text-slate-300 hover:text-slate-500 active:cursor-grabbing"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className={`grid h-7 w-7 flex-shrink-0 place-items-center rounded-full text-xs font-bold text-white ${style_info.badge}`}>
          {a.type === 'note' ? <StickyNote className="h-3.5 w-3.5" /> : a.type === 'transport' ? <Truck className="h-3.5 w-3.5" /> : index + 1}
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
          {/* Photo thumbnails */}
          {a.photos && a.photos.length > 0 && (
            <div className="mt-2 flex gap-1 overflow-x-auto">
              {a.photos.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt=""
                  className="h-12 w-12 flex-shrink-0 rounded object-cover"
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
