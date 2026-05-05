import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Settings2, X } from 'lucide-react'
import clsx from 'clsx'
import type { Day } from '@/lib/types'
import { formatDateISO } from '@/lib/utils'

export type DayTabConfig = {
  showDate: boolean
  showTitle: boolean
  showCount: boolean
}

export const DEFAULT_DAY_TAB_CONFIG: DayTabConfig = {
  showDate: true,
  showTitle: true,
  showCount: true,
}

export default function DayTabs({
  days, selectedId, onSelect, onAddDay, onRemoveDay, config = DEFAULT_DAY_TAB_CONFIG, onConfigChange,
}: {
  days: Day[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAddDay: () => void
  onRemoveDay?: (id: string) => void
  config?: DayTabConfig
  onConfigChange?: (cfg: DayTabConfig) => void
}) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  const handleToggleSettings = () => {
    if (!settingsOpen && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPopupPos({ top: rect.bottom + 6, left: rect.left })
    }
    setSettingsOpen((o) => !o)
  }

  useEffect(() => {
    if (!settingsOpen) return
    const handler = (e: MouseEvent) => {
      if (btnRef.current?.contains(e.target as Node)) return
      setSettingsOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [settingsOpen])

  return (
    <>
      <div className="flex flex-nowrap items-center gap-2">
        {days.map((d, i) => (
          <div key={d.id} className="group relative flex-shrink-0">
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
              {config.showTitle && d.title ? (
                <span className="font-medium">{d.title}</span>
              ) : (
                <span className="font-medium">Day {i + 1}</span>
              )}
              {config.showDate && (
                <span className="ml-2 text-xs text-slate-500">{formatDateISO(d.date)}</span>
              )}
              {config.showCount && (
                <span className="ml-1.5 text-[10px] text-slate-400">({d.activities.length})</span>
              )}
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
          className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Add day
        </button>

        {onConfigChange && (
          <button
            ref={btnRef}
            onClick={handleToggleSettings}
            title="Customize day tabs"
            className={clsx(
              'flex-shrink-0 rounded p-1.5 text-slate-400 transition hover:bg-slate-100',
              settingsOpen && 'bg-slate-100 text-slate-600',
            )}
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {settingsOpen && popupPos && onConfigChange && createPortal(
        <div
          className="fixed z-50 w-44 rounded-lg border border-slate-200 bg-white p-2 shadow-lg"
          style={{ top: popupPos.top, left: popupPos.left }}
        >
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Show in tab</p>
          {(
            [
              { key: 'showTitle', label: 'Day title / number' },
              { key: 'showDate', label: 'Date' },
              { key: 'showCount', label: 'Stop count' },
            ] as { key: keyof DayTabConfig; label: string }[]
          ).map(({ key, label }) => (
            <label key={key} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs text-slate-700 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={config[key]}
                onChange={() => onConfigChange({ ...config, [key]: !config[key] })}
                className="h-3 w-3 rounded accent-sky-600"
              />
              {label}
            </label>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
