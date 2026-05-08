// Best-effort regex-based extractor for flight info from pasted confirmation
// emails. The output is meant to pre-fill a form that the user reviews before
// saving — never a fully trusted source.
//
// Strategy: collect candidates for each field independently, then use simple
// heuristics (first IATA = departure, second = arrival; first time on a
// departure-side line = departure time, etc).

import type { FlightInfo } from './types'

export type ParseResult = Partial<FlightInfo> & { rawDate?: string }

const FLIGHT_NUMBER_RE = /\b([A-Z]{2}|[A-Z]\d|\d[A-Z])[\s-]?(\d{1,4})\b/g
// IATA airport code = standalone 3 capital letters. We exclude common false
// positives like "USA", "PNR", "KEY" by requiring it to appear adjacent to
// flight-context words (departure, arrival, from, to, →, -). Collected loosely
// then scored.
const IATA_RE = /\b([A-Z]{3})\b/g
const TIME_RE = /\b(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?\b/g
const DATE_RE = /\b(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:,?\s+\d{2,4})?)\b/i

const FALSE_IATA = new Set([
  'USA','PNR','GMT','UTC','EST','PST','CST','MST','EDT','PDT','CDT','MDT',
  'AND','THE','ALL','NEW','OLD','TEL','SEE','ETC','VIA','APT','PHN','REF',
  'BUS','FRI','SAT','SUN','MON','TUE','WED','THU','TBA','NIL','OUT','TBD',
])

function normalizeFlightNumber(carrier: string, number: string): string {
  return `${carrier.toUpperCase()} ${number}`
}

function findLabeled(text: string, labels: string[]): string | undefined {
  // Match "Label: VALUE" or "Label - VALUE" up to end of line.
  for (const label of labels) {
    const re = new RegExp(`${label}\\s*[:\\-]\\s*([^\\n\\r]+)`, 'i')
    const m = text.match(re)
    if (m) return m[1].trim()
  }
  return undefined
}

function parseTimeTo24h(h: number, m: number, ampm?: string): string {
  let hour = h
  if (ampm) {
    const isPM = ampm.toLowerCase() === 'pm'
    if (isPM && hour < 12) hour += 12
    if (!isPM && hour === 12) hour = 0
  }
  return `${String(hour).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function isoDate(text: string): string | undefined {
  const m = text.match(DATE_RE)
  if (!m) return undefined
  const raw = m[1]
  // ISO already
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  // Slash format M/D/YYYY or M/D/YY
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (slash) {
    const mo = String(parseInt(slash[1], 10)).padStart(2, '0')
    const d = String(parseInt(slash[2], 10)).padStart(2, '0')
    let y = slash[3]
    if (y.length === 2) y = '20' + y
    return `${y}-${mo}-${d}`
  }
  // "May 8, 2026" / "May 8 2026" / "May 8"
  const monthRe = /^([A-Za-z]+)\s+(\d{1,2})(?:,?\s+(\d{2,4}))?$/
  const monMatch = raw.match(monthRe)
  if (monMatch) {
    const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
    const mo = months.indexOf(monMatch[1].slice(0, 3).toLowerCase())
    if (mo === -1) return undefined
    const d = String(parseInt(monMatch[2], 10)).padStart(2, '0')
    const year = monMatch[3]
      ? (monMatch[3].length === 2 ? '20' + monMatch[3] : monMatch[3])
      : String(new Date().getFullYear())
    return `${year}-${String(mo + 1).padStart(2, '0')}-${d}`
  }
  return undefined
}

export function parseFlightText(text: string): ParseResult {
  if (!text || !text.trim()) return { departure: {}, arrival: {} }

  const result: ParseResult = { departure: {}, arrival: {} }

  // Flight number — take the first match
  FLIGHT_NUMBER_RE.lastIndex = 0
  const fnMatch = FLIGHT_NUMBER_RE.exec(text)
  if (fnMatch) {
    result.flightNumber = normalizeFlightNumber(fnMatch[1], fnMatch[2])
  }

  // IATA codes — collect, filter false positives, take first two
  IATA_RE.lastIndex = 0
  const iataMatches: string[] = []
  let im: RegExpExecArray | null
  while ((im = IATA_RE.exec(text)) !== null) {
    const code = im[1]
    if (FALSE_IATA.has(code)) continue
    if (!iataMatches.includes(code)) iataMatches.push(code)
    if (iataMatches.length >= 2) break
  }
  if (iataMatches[0]) result.departure!.airportCode = iataMatches[0]
  if (iataMatches[1]) result.arrival!.airportCode = iataMatches[1]

  // Times — first two
  TIME_RE.lastIndex = 0
  const times: string[] = []
  let tm: RegExpExecArray | null
  while ((tm = TIME_RE.exec(text)) !== null) {
    const h = parseInt(tm[1], 10)
    const m = parseInt(tm[2], 10)
    if (h > 24 || m >= 60) continue
    times.push(parseTimeTo24h(h, m, tm[3]))
    if (times.length >= 2) break
  }

  // Date (if present, combine with times into ISO datetimes)
  const date = isoDate(text)
  if (date) result.rawDate = date
  if (times[0]) {
    result.departure!.time = date ? `${date}T${times[0]}` : times[0]
  }
  if (times[1]) {
    result.arrival!.time = date ? `${date}T${times[1]}` : times[1]
  }

  // Labeled fields
  const confirmation = findLabeled(text, ['Confirmation', 'Confirmation Number', 'Booking Reference', 'Booking Ref', 'PNR', 'Reference', 'Record Locator'])
  if (confirmation) result.confirmation = confirmation.split(/\s/)[0]

  const seat = findLabeled(text, ['Seat'])
  if (seat) result.seat = seat.split(/\s/)[0]

  const bookingClass = findLabeled(text, ['Class', 'Cabin', 'Fare Class'])
  if (bookingClass) result.bookingClass = bookingClass

  // Terminal/gate — pair with departure or arrival heuristically:
  // multiple "Terminal:" matches → first = departure, second = arrival
  const allTerminals = [...text.matchAll(/Terminal\s*[:\-]?\s*([A-Z0-9]+)/gi)].map((m) => m[1])
  if (allTerminals[0]) result.departure!.terminal = allTerminals[0]
  if (allTerminals[1]) result.arrival!.terminal = allTerminals[1]

  const allGates = [...text.matchAll(/Gate\s*[:\-]?\s*([A-Z0-9]+)/gi)].map((m) => m[1])
  if (allGates[0]) result.departure!.gate = allGates[0]
  if (allGates[1]) result.arrival!.gate = allGates[1]

  // Airline name — try to find a recognisable airline keyword, otherwise leave blank
  const airlineMatch = text.match(/\b(American Airlines|United(?: Airlines)?|Delta(?: Air Lines)?|British Airways|Cathay Pacific|Cathay Dragon|Singapore Airlines|Lufthansa|Air France|KLM|Emirates|Qatar Airways|Etihad|Japan Airlines|All Nippon Airways|ANA|Korean Air|China Airlines|EVA Air|Hong Kong Airlines|Air Canada|Qantas|Virgin Atlantic|Virgin Australia|Ryanair|EasyJet|Southwest|JetBlue|Alaska Airlines|Spirit Airlines|Frontier Airlines)\b/i)
  if (airlineMatch) result.airline = airlineMatch[1]

  return result
}
