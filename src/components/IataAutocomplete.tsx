import { useEffect, useRef, useState } from 'react'

// Generic IATA autocomplete: text input + filtered dropdown. Free-text is
// preserved (Tab/Enter/blur commit whatever the user typed), so unknown
// codes or names still work without forcing a selection.
//
// Two render slots so callers can shape rows however they like — see
// FlightImportModal for usage.

export type IataAutocompleteProps<T> = {
  value: string
  onChange: (next: string) => void
  // Called when the user picks an item from the dropdown (mouse click,
  // keyboard Enter, or Tab while highlighted). Caller decides what side
  // effects to run (e.g. also fill the city field).
  onSelect?: (item: T) => void
  search: (query: string) => T[]
  // Render the line shown in the dropdown.
  renderItem: (item: T) => React.ReactNode
  // Map an item to the string that should land in the input on select.
  itemToValue: (item: T) => string
  placeholder?: string
  className?: string
  maxLength?: number
  uppercase?: boolean // visually + on commit
}

export default function IataAutocomplete<T>({
  value, onChange, onSelect, search, renderItem, itemToValue,
  placeholder, className, maxLength, uppercase,
}: IataAutocompleteProps<T>) {
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const [results, setResults] = useState<T[]>([])
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const r = search(value)
    setResults(r)
    setActiveIdx(0)
  }, [value, open, search])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const commit = (item: T) => {
    const next = itemToValue(item)
    onChange(uppercase ? next.toUpperCase() : next)
    onSelect?.(item)
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true); return
    }
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); commit(results[activeIdx]) }
    else if (e.key === 'Tab') { commit(results[activeIdx]) }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  return (
    <div ref={wrapRef} className={`relative ${className ?? ''}`}>
      <input
        value={value}
        onChange={(e) => {
          const v = uppercase ? e.target.value.toUpperCase() : e.target.value
          onChange(v)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        maxLength={maxLength}
        className="input w-full"
        autoComplete="off"
      />
      {open && results.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full min-w-[16rem] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {results.map((item, i) => (
            <li
              key={i}
              onMouseDown={(e) => { e.preventDefault(); commit(item) }}
              onMouseEnter={() => setActiveIdx(i)}
              className={`cursor-pointer border-b border-slate-100 px-3 py-1.5 text-xs last:border-0 ${
                i === activeIdx ? 'bg-sky-50 text-sky-900' : 'hover:bg-slate-50'
              }`}
            >
              {renderItem(item)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
