import airlinesData from '@/data/iata-airlines.json'
import airportsData from '@/data/iata-airports.json'

export type IataAirline = {
  code: string
  name: string
  country?: string
}

export type IataAirport = {
  code: string
  name: string
  city?: string
  country?: string
}

// Bundled at build time — instant lookup, works offline, no Firestore reads.
export const AIRLINES: IataAirline[] = airlinesData as IataAirline[]
export const AIRPORTS: IataAirport[] = airportsData as IataAirport[]

// Code → record maps (uppercased keys for case-insensitive lookup).
const airlineByCode = new Map(AIRLINES.map((a) => [a.code.toUpperCase(), a]))
const airportByCode = new Map(AIRPORTS.map((a) => [a.code.toUpperCase(), a]))

export function findAirline(code: string): IataAirline | undefined {
  return airlineByCode.get(code.trim().toUpperCase())
}

export function findAirport(code: string): IataAirport | undefined {
  return airportByCode.get(code.trim().toUpperCase())
}

// Searches by IATA code prefix, name, city, or country. Returns up to `limit`
// best matches. Code-prefix matches rank first, then name/city contains.
export function searchAirports(query: string, limit = 10): IataAirport[] {
  return searchList(AIRPORTS, query, limit, (a) => [a.code, a.name, a.city, a.country])
}

export function searchAirlines(query: string, limit = 10): IataAirline[] {
  return searchList(AIRLINES, query, limit, (a) => [a.code, a.name, a.country])
}

function searchList<T>(
  list: T[],
  query: string,
  limit: number,
  fields: (item: T) => (string | undefined)[],
): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return list.slice(0, limit)
  const codePrefix: T[] = []
  const wordStart: T[] = []
  const contains: T[] = []
  for (const item of list) {
    const fs = fields(item).filter((s): s is string => !!s).map((s) => s.toLowerCase())
    // First field is the code by convention — rank a code-prefix match highest
    if (fs[0]?.startsWith(q)) codePrefix.push(item)
    else if (fs.some((f) => f.split(/[\s,\-/]+/).some((tok) => tok.startsWith(q)))) wordStart.push(item)
    else if (fs.some((f) => f.includes(q))) contains.push(item)
    if (codePrefix.length + wordStart.length + contains.length >= limit * 3) break
  }
  return [...codePrefix, ...wordStart, ...contains].slice(0, limit)
}
