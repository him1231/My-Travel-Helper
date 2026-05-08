// All date helpers operate on naive ISO strings (YYYY-MM-DD) treated as
// calendar dates without a timezone. We avoid Date.UTC roundtrips because
// formatDateISO interprets the same string as a *local* date — mixing the
// two conventions causes off-by-one errors near midnight in non-UTC zones.

function pad2(n: number): string { return String(n).padStart(2, '0') }

export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  // Use a local Date and let it handle month/year rollover — toLocaleDateString
  // and formatDateISO both parse YYYY-MM-DD as local, so we stay consistent.
  const date = new Date(y, m - 1, d + days)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

export function formatDateISO(iso: string, opts?: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString(undefined, opts ?? { weekday: 'short', month: 'short', day: 'numeric' })
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
  } catch {
    return `${amount} ${currency}`
  }
}

// Recursively removes undefined values from an object/array (Firestore writes
// reject undefined). Preserves Date, Timestamp, and other non-plain-object
// instances by reference — JSON.parse(JSON.stringify(...)) would mangle them.
export function stripUndefinedDeep<T>(value: T): T {
  return strip(value) as T
}

function strip(value: unknown): unknown {
  if (value === undefined) return undefined
  if (value === null) return null
  if (Array.isArray(value)) {
    return value.map((v) => (v === undefined ? null : strip(v)))
  }
  if (typeof value !== 'object') return value
  // Preserve class instances (Date, Timestamp, GeoPoint, etc.) — only walk plain objects
  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) return value
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === undefined) continue
    out[k] = strip(v)
  }
  return out
}

/**
 * Export a list of days/activities as an iCalendar (.ics) file download.
 */
export function exportIcal(tripTitle: string, days: import('./types').Day[]): void {
  const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')

  const foldLine = (line: string): string => {
    const chunks: string[] = []
    while (line.length > 75) {
      chunks.push(line.slice(0, 75))
      line = ' ' + line.slice(75)
    }
    chunks.push(line)
    return chunks.join('\r\n')
  }

  const stamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z'

  const veventLines: string[] = []

  for (const day of days) {
    for (const a of day.activities) {
      if (!a.startTime) continue
      const [h, m] = a.startTime.split(':').map(Number)
      const [y, mo, d] = day.date.split('-').map(Number)

      const startDate = new Date(Date.UTC(y, mo - 1, d, h, m))
      const endDate = new Date(startDate.getTime() + (a.durationMinutes ?? 30) * 60_000)

      const formatDt = (dt: Date) =>
        dt.toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z'

      const uid = `${a.id}@my-travel-helper`
      const location = a.poi?.address ?? a.poi?.name ?? ''

      veventLines.push(
        'BEGIN:VEVENT',
        foldLine(`UID:${uid}`),
        foldLine(`DTSTAMP:${stamp}`),
        foldLine(`DTSTART:${formatDt(startDate)}`),
        foldLine(`DTEND:${formatDt(endDate)}`),
        foldLine(`SUMMARY:${escape(a.title)}`),
        ...(location ? [foldLine(`LOCATION:${escape(location)}`)] : []),
        ...(a.notes ? [foldLine(`DESCRIPTION:${escape(a.notes)}`)] : []),
        'END:VEVENT',
      )
    }
  }

  if (veventLines.length === 0) return

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//My Travel Helper//EN`,
    foldLine(`X-WR-CALNAME:${escape(tripTitle)}`),
    ...veventLines,
    'END:VCALENDAR',
  ].join('\r\n')

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${tripTitle.replace(/[^a-z0-9]/gi, '-')}.ics`
  a.click()
  URL.revokeObjectURL(url)
}
