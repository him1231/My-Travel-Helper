import {
  collection, doc, addDoc, deleteDoc, updateDoc, setDoc, getDocs,
  query, where, orderBy, onSnapshot, serverTimestamp, writeBatch,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Trip, Day, Activity, POI } from '@/lib/types'
import { stripUndefinedDeep } from '@/lib/utils'

const tripsCol = collection(db, 'trips')
const daysCol = (tripId: string) => collection(db, 'trips', tripId, 'days')

export type NewTripInput = {
  title: string
  destination?: POI
  startDate?: string
  endDate?: string
  currency: string
}

export async function createTrip(uid: string, input: NewTripInput): Promise<string> {
  const data = stripUndefinedDeep({
    ownerId: uid,
    memberIds: [uid],
    shareToken: null,
    title: input.title,
    description: '',
    coverPhotoUrl: '',
    destination: input.destination ?? null,
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    currency: input.currency,
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

export function subscribeUserTrips(uid: string, cb: (trips: Trip[]) => void) {
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
    (err) => { console.error('subscribeUserTrips:', err); cb([]) },
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

export async function removeDay(tripId: string, dayId: string) {
  await deleteDoc(doc(daysCol(tripId), dayId))
}

async function setDayActivities(tripId: string, dayId: string, activities: Activity[]) {
  const cleaned = stripUndefinedDeep(activities)
  await setDoc(doc(daysCol(tripId), dayId), { activities: cleaned }, { merge: true })
}

export async function addActivity(tripId: string, day: Day, activity: Activity) {
  const activities = [...day.activities, activity]
  await setDayActivities(tripId, day.id, activities)
}

export async function updateActivity(tripId: string, day: Day, activityId: string, patch: Partial<Activity>) {
  const activities = day.activities.map((a) => {
    if (a.id !== activityId) return a
    const merged = { ...a } as Record<string, unknown>
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete merged[k]
      else merged[k] = v as unknown
    }
    return merged as Activity
  })
  await setDayActivities(tripId, day.id, activities)
}

export async function removeActivity(tripId: string, day: Day, activityId: string) {
  const activities = day.activities.filter((a) => a.id !== activityId)
  await setDayActivities(tripId, day.id, activities)
}

export async function reorderActivities(tripId: string, day: Day, orderedIds: string[]) {
  const map = new Map(day.activities.map((a) => [a.id, a]))
  const activities = orderedIds
    .map((id, i) => {
      const a = map.get(id)
      return a ? { ...a, order: i } : null
    })
    .filter((a): a is Activity => a !== null)
  await setDayActivities(tripId, day.id, activities)
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
