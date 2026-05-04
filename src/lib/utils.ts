export function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
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

export function stripUndefinedDeep<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
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
