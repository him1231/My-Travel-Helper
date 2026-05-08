import {
  collection, doc, addDoc, deleteDoc, updateDoc, setDoc, getDocs,
  query, where, orderBy, onSnapshot, serverTimestamp, writeBatch, deleteField, runTransaction,
  type Transaction,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Trip, Day, Activity, POI, ScratchList } from '@/lib/types'
import { stripUndefinedDeep } from '@/lib/utils'

const tripsCol = collection(db, 'trips')
const daysCol = (tripId: string) => collection(db, 'trips', tripId, 'days')

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
    await setDoc(doc(daysCol(ref.id), input.startDate), {
      date: input.startDate,
      notes: '',
      activities: [],
    })
  }
  return ref.id
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
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Day, 'id'>) })))
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
// E.g. drag Day 5 (Mar 14) between Day 1 and Day 2:
//   slot Mar 10 ← Day 1 content (unchanged)
//   slot Mar 11 ← Day 5 content  ← moved here
//   slot Mar 12 ← Day 2 content  ← shifted down
//   slot Mar 13 ← Day 3 content
//   slot Mar 14 ← Day 4 content
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
    dayOrder: deleteField(), // content is now in the correct date slots
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

// ── Activity reads inside a transaction ───────────────────────────────────────

async function readDayActivities(tx: Transaction, tripId: string, dayId: string): Promise<Activity[]> {
  const snap = await tx.get(doc(daysCol(tripId), dayId))
  if (!snap.exists()) return []
  const data = snap.data() as Day
  return [...(data.activities ?? [])]
}

async function readListActivities(tx: Transaction, tripId: string, listId: string): Promise<Activity[]> {
  const snap = await tx.get(doc(listsCol(tripId), listId))
  if (!snap.exists()) return []
  const data = snap.data() as ScratchList
  return [...(data.activities ?? [])]
}

function writeDayActivities(tx: Transaction, tripId: string, dayId: string, activities: Activity[]) {
  tx.set(doc(daysCol(tripId), dayId), { activities: stripUndefinedDeep(activities) }, { merge: true })
}

function writeListActivities(tx: Transaction, tripId: string, listId: string, activities: Activity[]) {
  tx.set(doc(listsCol(tripId), listId), { activities: stripUndefinedDeep(activities) }, { merge: true })
}

// ── Day-activity writes (transactional) ────────────────────────────────────────

export async function addActivity(tripId: string, dayId: string, activity: Activity): Promise<void> {
  await runTransaction(db, async (tx) => {
    const current = await readDayActivities(tx, tripId, dayId)
    const next = [...current, { ...activity, order: current.length }]
    writeDayActivities(tx, tripId, dayId, next)
  })
}

export async function updateActivity(
  tripId: string, dayId: string, activityId: string, patch: Partial<Activity>,
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const current = await readDayActivities(tx, tripId, dayId)
    const next = current.map((a) => (a.id === activityId ? mergePatch(a, patch) : a))
    writeDayActivities(tx, tripId, dayId, next)
  })
}

export async function removeActivity(tripId: string, dayId: string, activityId: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const current = await readDayActivities(tx, tripId, dayId)
    const next = current.filter((a) => a.id !== activityId)
    writeDayActivities(tx, tripId, dayId, next)
  })
}

export async function reorderActivities(
  tripId: string, dayId: string, orderedIds: string[],
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const current = await readDayActivities(tx, tripId, dayId)
    const map = new Map(current.map((a) => [a.id, a]))
    const next = orderedIds
      .map((id, i) => { const a = map.get(id); return a ? { ...a, order: i } : null })
      .filter((a): a is Activity => a !== null)
    writeDayActivities(tx, tripId, dayId, next)
  })
}

export async function moveActivityBetweenDays(
  tripId: string, fromDayId: string, toDayId: string, activityId: string, toIndex?: number,
): Promise<void> {
  if (fromDayId === toDayId) return
  await runTransaction(db, async (tx) => {
    const fromList = await readDayActivities(tx, tripId, fromDayId)
    const toList = await readDayActivities(tx, tripId, toDayId)
    const activity = fromList.find((a) => a.id === activityId)
    if (!activity) return
    const moved: Activity = {
      ...activity,
      // hotelCheckIn references its host day; rewrite when moving to a new day.
      ...(activity.hotelCheckIn ? { hotelCheckIn: toDayId } : {}),
    }
    const fromNext = fromList.filter((a) => a.id !== activityId)
    const insertAt = clampIndex(toIndex, toList.length)
    const toNext = [...toList.slice(0, insertAt), moved, ...toList.slice(insertAt)]
      .map((a, i) => ({ ...a, order: i }))
    const fromReindexed = fromNext.map((a, i) => ({ ...a, order: i }))
    writeDayActivities(tx, tripId, fromDayId, fromReindexed)
    writeDayActivities(tx, tripId, toDayId, toNext)
  })
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
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Day, 'id'>) }))
}

// ── Scratch Lists ──────────────────────────────────────────────────────────

const listsCol = (tripId: string) => collection(db, 'trips', tripId, 'lists')

export function subscribeScratchLists(tripId: string, cb: (lists: ScratchList[]) => void) {
  return onSnapshot(
    query(listsCol(tripId), orderBy('createdAt')),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ScratchList, 'id'>) }))),
    (err) => { console.error('subscribeScratchLists:', err); cb([]) },
  )
}

export async function addScratchList(tripId: string, name: string): Promise<string> {
  const ref = await addDoc(listsCol(tripId), { name, activities: [], createdAt: serverTimestamp() })
  return ref.id
}

export async function renameScratchList(tripId: string, listId: string, name: string): Promise<void> {
  await updateDoc(doc(listsCol(tripId), listId), { name })
}

export async function removeScratchList(tripId: string, listId: string): Promise<void> {
  await deleteDoc(doc(listsCol(tripId), listId))
}

export async function addActivityToList(
  tripId: string, listId: string, activity: Activity,
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const current = await readListActivities(tx, tripId, listId)
    const next = [...current, { ...activity, order: current.length }]
    writeListActivities(tx, tripId, listId, next)
  })
}

export async function updateActivityInList(
  tripId: string, listId: string, activityId: string, patch: Partial<Activity>,
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const current = await readListActivities(tx, tripId, listId)
    const next = current.map((a) => (a.id === activityId ? mergePatch(a, patch) : a))
    writeListActivities(tx, tripId, listId, next)
  })
}

export async function removeActivityFromList(
  tripId: string, listId: string, activityId: string,
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const current = await readListActivities(tx, tripId, listId)
    const next = current.filter((a) => a.id !== activityId)
    writeListActivities(tx, tripId, listId, next)
  })
}

export async function reorderListActivities(
  tripId: string, listId: string, orderedIds: string[],
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const current = await readListActivities(tx, tripId, listId)
    const map = new Map(current.map((a) => [a.id, a]))
    const next = orderedIds
      .map((id, i) => { const a = map.get(id); return a ? { ...a, order: i } : null })
      .filter((a): a is Activity => a !== null)
    writeListActivities(tx, tripId, listId, next)
  })
}

export async function moveBetweenDayAndList(
  tripId: string, fromDayId: string, toListId: string, activityId: string, toIndex?: number,
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const fromList = await readDayActivities(tx, tripId, fromDayId)
    const toList = await readListActivities(tx, tripId, toListId)
    const activity = fromList.find((a) => a.id === activityId)
    if (!activity) return
    // Strip hotelCheckIn — a scratch list isn't a day, so the day-id reference is meaningless there.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { hotelCheckIn: _drop, ...rest } = activity
    const moved: Activity = rest as Activity
    const fromNext = fromList.filter((a) => a.id !== activityId).map((a, i) => ({ ...a, order: i }))
    const insertAt = clampIndex(toIndex, toList.length)
    const toNext = [...toList.slice(0, insertAt), moved, ...toList.slice(insertAt)]
      .map((a, i) => ({ ...a, order: i }))
    writeDayActivities(tx, tripId, fromDayId, fromNext)
    writeListActivities(tx, tripId, toListId, toNext)
  })
}

export async function moveFromListToDay(
  tripId: string, fromListId: string, toDayId: string, activityId: string, toIndex?: number,
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const fromList = await readListActivities(tx, tripId, fromListId)
    const toList = await readDayActivities(tx, tripId, toDayId)
    const activity = fromList.find((a) => a.id === activityId)
    if (!activity) return
    const moved: Activity = {
      ...activity,
      ...(activity.hotelCheckIn ? { hotelCheckIn: toDayId } : {}),
    }
    const fromNext = fromList.filter((a) => a.id !== activityId).map((a, i) => ({ ...a, order: i }))
    const insertAt = clampIndex(toIndex, toList.length)
    const toNext = [...toList.slice(0, insertAt), moved, ...toList.slice(insertAt)]
      .map((a, i) => ({ ...a, order: i }))
    writeListActivities(tx, tripId, fromListId, fromNext)
    writeDayActivities(tx, tripId, toDayId, toNext)
  })
}

export async function moveBetweenLists(
  tripId: string, fromListId: string, toListId: string, activityId: string, toIndex?: number,
): Promise<void> {
  if (fromListId === toListId) return
  await runTransaction(db, async (tx) => {
    const fromList = await readListActivities(tx, tripId, fromListId)
    const toList = await readListActivities(tx, tripId, toListId)
    const activity = fromList.find((a) => a.id === activityId)
    if (!activity) return
    const fromNext = fromList.filter((a) => a.id !== activityId).map((a, i) => ({ ...a, order: i }))
    const insertAt = clampIndex(toIndex, toList.length)
    const toNext = [...toList.slice(0, insertAt), activity, ...toList.slice(insertAt)]
      .map((a, i) => ({ ...a, order: i }))
    writeListActivities(tx, tripId, fromListId, fromNext)
    writeListActivities(tx, tripId, toListId, toNext)
  })
}

// ── helpers ────────────────────────────────────────────────────────────────────

function clampIndex(idx: number | undefined, max: number): number {
  if (idx === undefined || idx < 0) return max
  return Math.min(idx, max)
}

function mergePatch(activity: Activity, patch: Partial<Activity>): Activity {
  const merged = { ...activity } as Record<string, unknown>
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete merged[k]
    else merged[k] = v as unknown
  }
  return merged as Activity
}
