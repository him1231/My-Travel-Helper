import {
  collection, doc, addDoc, deleteDoc, updateDoc, setDoc, getDocs,
  query, where, orderBy, onSnapshot, serverTimestamp, writeBatch, deleteField,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Trip, Day, Activity, POI, ScratchList } from '@/lib/types'
import { stripUndefinedDeep, addDaysISO } from '@/lib/utils'

const tripsCol = collection(db, 'trips')
const daysCol = (tripId: string) => collection(db, 'trips', tripId, 'days')
const listsCol = (tripId: string) => collection(db, 'trips', tripId, 'lists')

export type NewTripInput = {
  title: string
  description?: string
  destination?: POI
  startDate?: string
  endDate?: string
  currency: string
  budgetLimit?: { amount: number; currency: string }
}

export async function createTrip(uid: string, input: NewTripInput): Promise<string> {
  const data = stripUndefinedDeep({
    ownerId: uid,
    memberIds: [uid],
    shareToken: null,
    title: input.title,
    description: input.description ?? '',
    coverPhotoUrl: '',
    destination: input.destination ?? null,
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    currency: input.currency,
    budgetLimit: input.budgetLimit ?? null,
    checklist: [],
  })
  const ref = await addDoc(tripsCol, {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  if (input.startDate) {
    // Seed every day in the range so the day list matches the trip's stated span.
    const dates = enumerateDates(input.startDate, input.endDate ?? input.startDate)
    const batch = writeBatch(db)
    dates.forEach((date) => {
      batch.set(doc(daysCol(ref.id), date), { date, notes: '', activities: [] })
    })
    await batch.commit()
  }
  return ref.id
}

// Inclusive range of YYYY-MM-DD dates from start..end. Returns empty if end < start.
function enumerateDates(start: string, end: string): string[] {
  const out: string[] = []
  let cur = start
  // Defensive cap so a malformed range doesn't loop forever.
  for (let i = 0; i < 366 && cur <= end; i++) {
    out.push(cur)
    cur = addDaysISO(cur, 1)
  }
  return out
}

export function subscribeUserTrips(
  uid: string,
  cb: (trips: Trip[]) => void,
  onError?: (err: unknown) => void,
) {
  // orderBy('createdAt') combined with array-contains needs a composite index — sort client-side instead
  const q = query(tripsCol, where('memberIds', 'array-contains', uid))
  return onSnapshot(
    q,
    (snap) => {
      const trips = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Trip, 'id'>) }))
        .sort((a, b) => {
          const at = a.createdAt?.toMillis() ?? 0
          const bt = b.createdAt?.toMillis() ?? 0
          return bt - at
        })
      cb(trips)
    },
    (err) => { console.error('subscribeUserTrips:', err); onError?.(err) },
  )
}

export function subscribeTrip(tripId: string, cb: (trip: Trip | null) => void) {
  return onSnapshot(doc(tripsCol, tripId), (snap) => {
    if (!snap.exists()) { cb(null); return }
    cb({ id: snap.id, ...(snap.data() as Omit<Trip, 'id'>) })
  })
}

export function subscribeDays(tripId: string, cb: (days: Day[]) => void) {
  const q = query(daysCol(tripId), orderBy('date'))
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => {
      const data = d.data() as Omit<Day, 'id'>
      return { id: d.id, ...data, activities: sortByOrder(data.activities ?? []) }
    }))
  })
}

export async function updateTrip(tripId: string, patch: Partial<Trip>) {
  await updateDoc(doc(tripsCol, tripId), {
    ...stripUndefinedDeep(patch),
    updatedAt: serverTimestamp(),
  })
}

// Reorders day content (activities, title, notes) across the fixed date slots.
// The date documents keep their existing IDs; the dragged content is written into
// whichever date slot it now occupies in the sorted date sequence.
export async function reassignDayDates(
  tripId: string,
  orderedDays: Day[],
): Promise<void> {
  const sortedDates = [...orderedDays].map((d) => d.date).sort()
  // Map old day-id → new target date so hotelCheckIn references can follow the shift.
  const idRemap = new Map<string, string>()
  orderedDays.forEach((day, i) => {
    if (day.id !== sortedDates[i]) idRemap.set(day.id, sortedDates[i])
  })

  const batch = writeBatch(db)

  orderedDays.forEach((day, i) => {
    const targetDate = sortedDates[i]
    if (day.id === targetDate) return // nothing moved into this slot

    const remappedActivities = day.activities.map((a) => {
      if (!a.hotelCheckIn) return a
      const next = idRemap.get(a.hotelCheckIn) ?? a.hotelCheckIn
      return next === a.hotelCheckIn ? a : { ...a, hotelCheckIn: next }
    })

    batch.set(doc(daysCol(tripId), targetDate), stripUndefinedDeep({
      date: targetDate,
      title: day.title ?? '',
      notes: day.notes ?? '',
      activities: remappedActivities,
    }), { merge: false })
  })

  batch.update(doc(tripsCol, tripId), {
    dayOrder: deleteField(), // legacy field cleanup
    updatedAt: serverTimestamp(),
  })

  await batch.commit()
}

export async function deleteTrip(tripId: string) {
  const daysSnap = await getDocs(daysCol(tripId))
  const batch = writeBatch(db)
  daysSnap.forEach((d) => batch.delete(d.ref))
  batch.delete(doc(tripsCol, tripId))
  await batch.commit()
}

export async function addDay(tripId: string, date: string) {
  await setDoc(doc(daysCol(tripId), date), { date, notes: '', activities: [] }, { merge: true })
}

export async function updateDayNotes(tripId: string, dayId: string, notes: string) {
  await updateDoc(doc(daysCol(tripId), dayId), { notes })
}

export async function updateDayTitle(tripId: string, dayId: string, title: string) {
  await updateDoc(doc(daysCol(tripId), dayId), { title })
}

// Removes a day and clears any hotelCheckIn references pointing at it from other days.
export async function removeDay(tripId: string, dayId: string) {
  const daysSnap = await getDocs(daysCol(tripId))
  const batch = writeBatch(db)
  batch.delete(doc(daysCol(tripId), dayId))
  daysSnap.forEach((d) => {
    if (d.id === dayId) return
    const data = d.data() as Day
    const activities = data.activities ?? []
    let dirty = false
    const cleaned = activities.map((a) => {
      if (a.hotelCheckIn === dayId) {
        dirty = true
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { hotelCheckIn: _drop, ...rest } = a
        return rest as Activity
      }
      return a
    })
    if (dirty) {
      batch.set(d.ref, { activities: stripUndefinedDeep(cleaned) }, { merge: true })
    }
  })
  await batch.commit()
}

// ── Day-activity writes ────────────────────────────────────────────────────────
// Single-document writes use plain setDoc (no transactions) so Firestore's
// latency-compensated cache makes the UI reflect changes immediately. This
// trades strict concurrent-write protection for responsiveness — acceptable
// since the app is mostly single-user per trip.

async function setDayActivities(tripId: string, dayId: string, activities: Activity[]): Promise<void> {
  await setDoc(doc(daysCol(tripId), dayId), { activities: stripUndefinedDeep(activities) }, { merge: true })
}

async function setListActivities(tripId: string, listId: string, activities: Activity[]): Promise<void> {
  await setDoc(doc(listsCol(tripId), listId), { activities: stripUndefinedDeep(activities) }, { merge: true })
}

export async function addActivity(tripId: string, day: Day, activity: Activity): Promise<void> {
  const next = [...day.activities, { ...activity, order: day.activities.length }]
  await setDayActivities(tripId, day.id, next)
}

export async function updateActivity(
  tripId: string, day: Day, activityId: string, patch: Partial<Activity>,
): Promise<void> {
  const next = day.activities.map((a) => (a.id === activityId ? mergePatch(a, patch) : a))
  await setDayActivities(tripId, day.id, next)
}

export async function removeActivity(tripId: string, day: Day, activityId: string): Promise<void> {
  const next = day.activities.filter((a) => a.id !== activityId)
  await setDayActivities(tripId, day.id, next)
}

export async function reorderActivities(
  tripId: string, day: Day, orderedIds: string[],
): Promise<void> {
  const map = new Map(day.activities.map((a) => [a.id, a]))
  const next = orderedIds
    .map((id, i) => { const a = map.get(id); return a ? { ...a, order: i } : null })
    .filter((a): a is Activity => a !== null)
  await setDayActivities(tripId, day.id, next)
}

export async function getTripByShareToken(token: string): Promise<Trip | null> {
  const q = query(tripsCol, where('shareToken', '==', token))
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = snap.docs[0]
  return { id: d.id, ...(d.data() as Omit<Trip, 'id'>) }
}

export async function getDaysForTrip(tripId: string): Promise<Day[]> {
  const q = query(daysCol(tripId), orderBy('date'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => {
    const data = d.data() as Omit<Day, 'id'>
    return { id: d.id, ...data, activities: sortByOrder(data.activities ?? []) }
  })
}

// ── Scratch Lists ──────────────────────────────────────────────────────────────

export function subscribeScratchLists(tripId: string, cb: (lists: ScratchList[]) => void) {
  return onSnapshot(
    query(listsCol(tripId), orderBy('createdAt')),
    (snap) => {
      const lists = snap.docs.map((d) => {
        const data = d.data() as Omit<ScratchList, 'id'>
        return { id: d.id, ...data, activities: sortByOrder(data.activities ?? []) }
      })
      cb(sortListsByOrder(lists))
    },
    (err) => { console.error('subscribeScratchLists:', err); cb([]) },
  )
}

export async function addScratchList(tripId: string, name: string, order?: number): Promise<string> {
  const data: Record<string, unknown> = { name, activities: [], createdAt: serverTimestamp() }
  if (order != null) data.order = order
  const ref = await addDoc(listsCol(tripId), data)
  return ref.id
}

export async function reorderScratchLists(tripId: string, orderedIds: string[]): Promise<void> {
  const batch = writeBatch(db)
  orderedIds.forEach((id, i) => {
    batch.update(doc(listsCol(tripId), id), { order: i })
  })
  await batch.commit()
}

export async function renameScratchList(tripId: string, listId: string, name: string): Promise<void> {
  await updateDoc(doc(listsCol(tripId), listId), { name })
}

export async function removeScratchList(tripId: string, listId: string): Promise<void> {
  await deleteDoc(doc(listsCol(tripId), listId))
}

export async function addActivityToList(
  tripId: string, list: ScratchList, activity: Activity,
): Promise<void> {
  const next = [...list.activities, { ...activity, order: list.activities.length }]
  await setListActivities(tripId, list.id, next)
}

export async function updateActivityInList(
  tripId: string, list: ScratchList, activityId: string, patch: Partial<Activity>,
): Promise<void> {
  const next = list.activities.map((a) => (a.id === activityId ? mergePatch(a, patch) : a))
  await setListActivities(tripId, list.id, next)
}

export async function removeActivityFromList(
  tripId: string, list: ScratchList, activityId: string,
): Promise<void> {
  const next = list.activities.filter((a) => a.id !== activityId)
  await setListActivities(tripId, list.id, next)
}

export async function reorderListActivities(
  tripId: string, list: ScratchList, orderedIds: string[],
): Promise<void> {
  const map = new Map(list.activities.map((a) => [a.id, a]))
  const next = orderedIds
    .map((id, i) => { const a = map.get(id); return a ? { ...a, order: i } : null })
    .filter((a): a is Activity => a !== null)
  await setListActivities(tripId, list.id, next)
}

// ── Cross-document moves (writeBatch — atomic for writes, latency-compensated) ─

export async function moveActivityBetweenDays(
  tripId: string, fromDay: Day, toDay: Day, activityId: string, toIndex?: number,
): Promise<void> {
  if (fromDay.id === toDay.id) return
  const activity = fromDay.activities.find((a) => a.id === activityId)
  if (!activity) return
  const moved: Activity = {
    ...activity,
    // hotelCheckIn references its host day; rewrite when moving to a new day.
    ...(activity.hotelCheckIn ? { hotelCheckIn: toDay.id } : {}),
  }
  const fromNext = fromDay.activities.filter((a) => a.id !== activityId).map((a, i) => ({ ...a, order: i }))
  const insertAt = clampIndex(toIndex, toDay.activities.length)
  const toNext = [...toDay.activities.slice(0, insertAt), moved, ...toDay.activities.slice(insertAt)]
    .map((a, i) => ({ ...a, order: i }))
  const batch = writeBatch(db)
  batch.set(doc(daysCol(tripId), fromDay.id), { activities: stripUndefinedDeep(fromNext) }, { merge: true })
  batch.set(doc(daysCol(tripId), toDay.id), { activities: stripUndefinedDeep(toNext) }, { merge: true })
  await batch.commit()
}

export async function moveBetweenDayAndList(
  tripId: string, fromDay: Day, toList: ScratchList, activityId: string, toIndex?: number,
): Promise<void> {
  const activity = fromDay.activities.find((a) => a.id === activityId)
  if (!activity) return
  // Strip hotelCheckIn — a scratch list isn't a day, so the day-id reference is meaningless there.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { hotelCheckIn: _drop, ...rest } = activity
  const moved: Activity = rest as Activity
  const fromNext = fromDay.activities.filter((a) => a.id !== activityId).map((a, i) => ({ ...a, order: i }))
  const insertAt = clampIndex(toIndex, toList.activities.length)
  const toNext = [...toList.activities.slice(0, insertAt), moved, ...toList.activities.slice(insertAt)]
    .map((a, i) => ({ ...a, order: i }))
  const batch = writeBatch(db)
  batch.set(doc(daysCol(tripId), fromDay.id), { activities: stripUndefinedDeep(fromNext) }, { merge: true })
  batch.set(doc(listsCol(tripId), toList.id), { activities: stripUndefinedDeep(toNext) }, { merge: true })
  await batch.commit()
}

export async function moveFromListToDay(
  tripId: string, fromList: ScratchList, toDay: Day, activityId: string, toIndex?: number,
): Promise<void> {
  const activity = fromList.activities.find((a) => a.id === activityId)
  if (!activity) return
  const moved: Activity = {
    ...activity,
    ...(activity.hotelCheckIn ? { hotelCheckIn: toDay.id } : {}),
  }
  const fromNext = fromList.activities.filter((a) => a.id !== activityId).map((a, i) => ({ ...a, order: i }))
  const insertAt = clampIndex(toIndex, toDay.activities.length)
  const toNext = [...toDay.activities.slice(0, insertAt), moved, ...toDay.activities.slice(insertAt)]
    .map((a, i) => ({ ...a, order: i }))
  const batch = writeBatch(db)
  batch.set(doc(listsCol(tripId), fromList.id), { activities: stripUndefinedDeep(fromNext) }, { merge: true })
  batch.set(doc(daysCol(tripId), toDay.id), { activities: stripUndefinedDeep(toNext) }, { merge: true })
  await batch.commit()
}

export async function moveBetweenLists(
  tripId: string, fromList: ScratchList, toList: ScratchList, activityId: string, toIndex?: number,
): Promise<void> {
  if (fromList.id === toList.id) return
  const activity = fromList.activities.find((a) => a.id === activityId)
  if (!activity) return
  const fromNext = fromList.activities.filter((a) => a.id !== activityId).map((a, i) => ({ ...a, order: i }))
  const insertAt = clampIndex(toIndex, toList.activities.length)
  const toNext = [...toList.activities.slice(0, insertAt), activity, ...toList.activities.slice(insertAt)]
    .map((a, i) => ({ ...a, order: i }))
  const batch = writeBatch(db)
  batch.set(doc(listsCol(tripId), fromList.id), { activities: stripUndefinedDeep(fromNext) }, { merge: true })
  batch.set(doc(listsCol(tripId), toList.id), { activities: stripUndefinedDeep(toNext) }, { merge: true })
  await batch.commit()
}

// ── helpers ────────────────────────────────────────────────────────────────────

function clampIndex(idx: number | undefined, max: number): number {
  if (idx === undefined || idx < 0) return max
  return Math.min(idx, max)
}

// Defensive sort by .order so that any external mutation or partial merge
// that scrambles array order doesn't corrupt the rendered sequence.
function sortByOrder(activities: Activity[]): Activity[] {
  return [...activities].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

// Lists that have been reordered have an explicit `order`; legacy lists fall
// back to createdAt order (already imposed by the server-side query).
function sortListsByOrder(lists: ScratchList[]): ScratchList[] {
  if (!lists.some((l) => l.order != null)) return lists
  return [...lists].sort((a, b) => {
    const ao = a.order ?? Number.MAX_SAFE_INTEGER
    const bo = b.order ?? Number.MAX_SAFE_INTEGER
    if (ao !== bo) return ao - bo
    const at = a.createdAt?.toMillis() ?? 0
    const bt = b.createdAt?.toMillis() ?? 0
    return at - bt
  })
}

function mergePatch(activity: Activity, patch: Partial<Activity>): Activity {
  const merged = { ...activity } as Record<string, unknown>
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete merged[k]
    else merged[k] = v as unknown
  }
  return merged as Activity
}
