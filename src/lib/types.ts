import type { Timestamp } from 'firebase/firestore'

export type ActivityCategory = 'sight' | 'food' | 'hotel' | 'transport' | 'other'

export type POI = {
  placeId?: string
  name: string
  lat: number
  lng: number
  address?: string
  category?: ActivityCategory
  rating?: number
  url?: string
  photoUrl?: string
}

export type Money = { amount: number; currency: string }

export type RouteInfo = {
  mode: 'straight' | 'drive'
  polyline?: { lat: number; lng: number }[]
  distanceM?: number
  durationS?: number
}

export type Activity = {
  id: string
  order: number
  type: 'poi' | 'transport' | 'note'
  title: string
  poi?: POI
  startTime?: string // "HH:mm"
  durationMinutes?: number
  cost?: Money
  notes?: string
  photos?: string[]
  route?: RouteInfo
}

export type Day = {
  id: string // ISO date "YYYY-MM-DD"
  date: string
  title?: string
  notes?: string
  activities: Activity[]
}

export type ScratchList = {
  id: string
  name: string
  activities: Activity[]
  createdAt: Timestamp | null
}

export type ChecklistItem = { id: string; text: string; done: boolean }

export type Trip = {
  id: string
  ownerId: string
  memberIds: string[]
  shareToken?: string | null

  title: string
  description?: string
  coverPhotoUrl?: string

  destination?: POI
  startDate?: string
  endDate?: string
  currency: string
  budgetLimit?: Money

  checklist: ChecklistItem[]
  dayOrder?: string[] // custom kanban column order (day IDs); falls back to date sort

  createdAt: Timestamp | null
  updatedAt: Timestamp | null
}

export type UserProfile = {
  uid: string
  displayName: string | null
  email: string | null
  photoURL: string | null
  prefs?: {
    units?: 'metric' | 'imperial'
    currency?: string
    theme?: 'light' | 'dark'
  }
}
