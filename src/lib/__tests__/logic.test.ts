import { describe, it, expect } from 'vitest'
import { addDaysISO } from '../utils'
import type { Activity, Day } from '../types'

// ── Helpers mirroring production logic ────────────────────────────────────────
// These replicate the pure algorithmic cores from OverviewView and TripDetail.

/** Mirror of the activity column-mutation logic in OverviewView.handleDragOver */
function applyActivityDrag(
  columns: Map<string, Activity[]>,
  activityId: string,
  toColKey: string,
  overActivityId: string | null,
): Map<string, Activity[]> {
  let sourceCK: string | null = null
  let item: Activity | undefined
  for (const [ck, list] of columns) {
    const found = list.find((a) => a.id === activityId)
    if (found) { sourceCK = ck; item = found; break }
  }
  if (!sourceCK || !item) return columns

  const next = new Map(columns)
  if (sourceCK === toColKey) {
    const list = [...(next.get(sourceCK) ?? [])]
    const fromIdx = list.findIndex((a) => a.id === activityId)
    list.splice(fromIdx, 1)
    const toIdx = overActivityId ? list.findIndex((a) => a.id === overActivityId) : list.length
    list.splice(toIdx === -1 ? list.length : toIdx, 0, item)
    next.set(sourceCK, list)
  } else {
    const fromList = (next.get(sourceCK) ?? []).filter((a) => a.id !== activityId)
    const toList = [...(next.get(toColKey) ?? [])]
    const toIdx = overActivityId ? toList.findIndex((a) => a.id === overActivityId) : toList.length
    toList.splice(toIdx === -1 ? toList.length : toIdx, 0, item)
    next.set(sourceCK, fromList)
    next.set(toColKey, toList)
  }
  return next
}

/** Mirror of hotel banner derivation in TripDetail */
function deriveHotelBanners(days: Day[], selectedDayId: string) {
  const idx = days.findIndex((d) => d.id === selectedDayId)
  const prevDay = idx > 0 ? days[idx - 1] : null
  const checkIn = days[idx]?.activities.find(
    (a) => a.poi?.category === 'hotel' && a.hotelCheckIn === selectedDayId,
  ) ?? null
  const checkOut = prevDay?.activities.find(
    (a) => a.poi?.category === 'hotel' && a.hotelCheckIn === prevDay.id,
  ) ?? null
  return { checkIn, checkOut }
}

/** Mirror of reassignDayDates slot-assignment logic in trips.ts */
function computeNewDateSlots(orderedDays: Day[]): { dayId: string; targetDate: string }[] {
  const sortedDates = [...orderedDays].map((d) => d.date).sort()
  return orderedDays.map((day, i) => ({ dayId: day.id, targetDate: sortedDates[i] }))
}

// ── Factories ─────────────────────────────────────────────────────────────────

function makeActivity(id: string, overrides: Partial<Activity> = {}): Activity {
  return { id, order: 0, type: 'poi', title: id, ...overrides }
}

function makeDay(id: string, activities: Activity[] = [], overrides: Partial<Day> = {}): Day {
  return { id, date: id, notes: '', activities, ...overrides }
}

// ── Activity drag within same column ─────────────────────────────────────────

describe('applyActivityDrag — same column reorder', () => {
  it('moves item from position 0 to end', () => {
    const a1 = makeActivity('a1')
    const a2 = makeActivity('a2')
    const a3 = makeActivity('a3')
    const cols = new Map([['col1', [a1, a2, a3]]])
    const result = applyActivityDrag(cols, 'a1', 'col1', null)
    expect(result.get('col1')!.map((a) => a.id)).toEqual(['a2', 'a3', 'a1'])
  })

  it('moves item from end to before a specific item', () => {
    const a1 = makeActivity('a1')
    const a2 = makeActivity('a2')
    const a3 = makeActivity('a3')
    const cols = new Map([['col1', [a1, a2, a3]]])
    const result = applyActivityDrag(cols, 'a3', 'col1', 'a1')
    expect(result.get('col1')!.map((a) => a.id)).toEqual(['a3', 'a1', 'a2'])
  })

  it('dragging item over the next item swaps them', () => {
    // a1 dragged over a2 means: remove a1, insert before a2 → [a2, a1] wait...
    // remove a1 from [a1,a2] → [a2], then insert before a2 at idx=0 → [a1, a2]
    // Actually: after splicing a1 out, list is [a2]. overActivityId=a2, idx=0, splice(0,0,a1) → [a1,a2]
    const a1 = makeActivity('a1')
    const a2 = makeActivity('a2')
    const a3 = makeActivity('a3')
    const cols = new Map([['col1', [a1, a2, a3]]])
    // drag a1 over a3 — a1 should move to just before a3
    const result = applyActivityDrag(cols, 'a1', 'col1', 'a3')
    expect(result.get('col1')!.map((a) => a.id)).toEqual(['a2', 'a1', 'a3'])
  })

  it('does not mutate the original map', () => {
    const a1 = makeActivity('a1')
    const a2 = makeActivity('a2')
    const original = new Map([['col1', [a1, a2]]])
    applyActivityDrag(original, 'a1', 'col1', null)
    expect(original.get('col1')!.map((a) => a.id)).toEqual(['a1', 'a2'])
  })
})

// ── Activity drag across columns ──────────────────────────────────────────────

describe('applyActivityDrag — cross-column move', () => {
  it('moves item from col1 to col2 at the end', () => {
    const a1 = makeActivity('a1')
    const b1 = makeActivity('b1')
    const cols = new Map([['col1', [a1]], ['col2', [b1]]])
    const result = applyActivityDrag(cols, 'a1', 'col2', null)
    expect(result.get('col1')!).toHaveLength(0)
    expect(result.get('col2')!.map((a) => a.id)).toEqual(['b1', 'a1'])
  })

  it('moves item from col1 to col2 before a specific item', () => {
    const a1 = makeActivity('a1')
    const b1 = makeActivity('b1')
    const b2 = makeActivity('b2')
    const cols = new Map([['col1', [a1]], ['col2', [b1, b2]]])
    const result = applyActivityDrag(cols, 'a1', 'col2', 'b1')
    expect(result.get('col2')!.map((a) => a.id)).toEqual(['a1', 'b1', 'b2'])
  })

  it('returns unchanged map for unknown activityId', () => {
    const cols = new Map([['col1', [makeActivity('a1')]]])
    const result = applyActivityDrag(cols, 'ghost', 'col1', null)
    expect(result).toBe(cols)
  })

  it('moves item to empty column', () => {
    const a1 = makeActivity('a1')
    const cols = new Map([['col1', [a1]], ['col2', []]])
    const result = applyActivityDrag(cols, 'a1', 'col2', null)
    expect(result.get('col1')!).toHaveLength(0)
    expect(result.get('col2')!.map((a) => a.id)).toEqual(['a1'])
  })
})

// ── Hotel banner derivation ───────────────────────────────────────────────────

describe('deriveHotelBanners', () => {
  const hotelAct = makeActivity('hotel1', {
    poi: { name: 'Grand Hotel', lat: 0, lng: 0, category: 'hotel' },
    hotelCheckIn: '2025-03-11',
  })

  it('shows check-in banner on the assigned day', () => {
    const days = [makeDay('2025-03-10'), makeDay('2025-03-11', [hotelAct])]
    const { checkIn, checkOut } = deriveHotelBanners(days, '2025-03-11')
    expect(checkIn?.id).toBe('hotel1')
    expect(checkOut).toBeNull()
  })

  it('shows check-out banner on the day after', () => {
    const days = [makeDay('2025-03-11', [hotelAct]), makeDay('2025-03-12')]
    const { checkIn, checkOut } = deriveHotelBanners(days, '2025-03-12')
    expect(checkOut?.id).toBe('hotel1')
    expect(checkIn).toBeNull()
  })

  it('shows both banners on a middle day (checked out of one, checked into another)', () => {
    const checkOutHotel = makeActivity('hotel0', {
      poi: { name: 'Hotel A', lat: 0, lng: 0, category: 'hotel' },
      hotelCheckIn: '2025-03-11',
    })
    const checkInHotel = makeActivity('hotel1', {
      poi: { name: 'Hotel B', lat: 0, lng: 0, category: 'hotel' },
      hotelCheckIn: '2025-03-12',
    })
    const days = [
      makeDay('2025-03-11', [checkOutHotel]),
      makeDay('2025-03-12', [checkInHotel]),
      makeDay('2025-03-13'),
    ]
    const { checkIn, checkOut } = deriveHotelBanners(days, '2025-03-12')
    expect(checkOut?.id).toBe('hotel0')
    expect(checkIn?.id).toBe('hotel1')
  })

  it('no banners on day with no hotel', () => {
    const days = [makeDay('2025-03-10'), makeDay('2025-03-11')]
    const { checkIn, checkOut } = deriveHotelBanners(days, '2025-03-11')
    expect(checkIn).toBeNull()
    expect(checkOut).toBeNull()
  })

  it('no check-out banner on the first day (no previous day)', () => {
    const days = [makeDay('2025-03-10', [hotelAct.id === 'hotel1' ? { ...hotelAct, hotelCheckIn: '2025-03-10' } : hotelAct])]
    const { checkOut } = deriveHotelBanners(days, '2025-03-10')
    expect(checkOut).toBeNull()
  })

  it('ignores regular POI activities (no hotelCheckIn)', () => {
    const regularAct = makeActivity('poi1', {
      poi: { name: 'Museum', lat: 0, lng: 0, category: 'sight' },
    })
    const days = [makeDay('2025-03-10'), makeDay('2025-03-11', [regularAct])]
    const { checkIn, checkOut } = deriveHotelBanners(days, '2025-03-11')
    expect(checkIn).toBeNull()
    expect(checkOut).toBeNull()
  })
})

// ── Day date-slot reassignment ────────────────────────────────────────────────

describe('computeNewDateSlots — day content reassignment', () => {
  it('unchanged order produces identity mapping', () => {
    const days = [
      makeDay('2025-03-10'),
      makeDay('2025-03-11'),
      makeDay('2025-03-12'),
    ]
    const slots = computeNewDateSlots(days)
    expect(slots).toEqual([
      { dayId: '2025-03-10', targetDate: '2025-03-10' },
      { dayId: '2025-03-11', targetDate: '2025-03-11' },
      { dayId: '2025-03-12', targetDate: '2025-03-12' },
    ])
  })

  it('reversed order maps each day content to opposite slot', () => {
    const days = [
      makeDay('2025-03-12'), // dragged to position 0
      makeDay('2025-03-11'), // dragged to position 1
      makeDay('2025-03-10'), // dragged to position 2
    ]
    const slots = computeNewDateSlots(days)
    // sorted dates are still [10, 11, 12]; content at pos 0 goes to slot 10, etc.
    expect(slots[0]).toEqual({ dayId: '2025-03-12', targetDate: '2025-03-10' })
    expect(slots[1]).toEqual({ dayId: '2025-03-11', targetDate: '2025-03-11' })
    expect(slots[2]).toEqual({ dayId: '2025-03-10', targetDate: '2025-03-12' })
  })

  it('drag last day to first position shifts all others down', () => {
    // User dragged Day 3 (Mar 12) to position 0
    const days = [
      makeDay('2025-03-12'),
      makeDay('2025-03-10'),
      makeDay('2025-03-11'),
    ]
    const slots = computeNewDateSlots(days)
    expect(slots[0]).toEqual({ dayId: '2025-03-12', targetDate: '2025-03-10' })
    expect(slots[1]).toEqual({ dayId: '2025-03-10', targetDate: '2025-03-11' })
    expect(slots[2]).toEqual({ dayId: '2025-03-11', targetDate: '2025-03-12' })
  })

  it('single day produces trivial mapping', () => {
    const days = [makeDay('2025-06-01')]
    expect(computeNewDateSlots(days)).toEqual([{ dayId: '2025-06-01', targetDate: '2025-06-01' }])
  })

  it('date sorting is lexicographic — ISO format guarantees correct ordering', () => {
    const days = [makeDay('2025-12-01'), makeDay('2025-09-15'), makeDay('2025-01-30')]
    const slots = computeNewDateSlots(days)
    const targetDates = slots.map((s) => s.targetDate)
    expect(targetDates).toEqual(['2025-01-30', '2025-09-15', '2025-12-01'])
  })
})

// ── addDaysISO used for trip anchor logic ─────────────────────────────────────

describe('addDaysISO trip anchor scenarios', () => {
  it('generates consecutive dates from a start date', () => {
    const start = '2025-06-01'
    const dates = [0, 1, 2, 3, 4].map((i) => addDaysISO(start, i))
    expect(dates).toEqual(['2025-06-01', '2025-06-02', '2025-06-03', '2025-06-04', '2025-06-05'])
  })
})
