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
}

export type Day = {
  id: string // ISO date "YYYY-MM-DD"
  date: string
  notes?: string
  activities: Activity[]
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
