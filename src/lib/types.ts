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
  // Signature of the prev/next POIs the polyline was computed against.
  // Used to invalidate cached polylines when neighbors change (reorder, insert, delete).
  cacheKey?: string
}

export type FlightLeg = {
  airportCode?: string  // IATA "JFK"
  airportName?: string  // "John F. Kennedy International"
  city?: string
  // Local time at airport, ISO without TZ: "2025-05-08T14:30"
  time?: string
  terminal?: string
  gate?: string
}

export type FlightInfo = {
  airline?: string         // "American Airlines" or "AA"
  flightNumber?: string    // normalized "AA 100"
  confirmation?: string    // PNR / booking reference
  seat?: string
  bookingClass?: string    // "Economy", "Business"
  departure: FlightLeg
  arrival: FlightLeg
}

export type Activity = {
  id: string
  order: number
  type: 'poi' | 'transport' | 'note' | 'flight'
  title: string
  poi?: POI
  startTime?: string // "HH:mm"
  durationMinutes?: number
  cost?: Money
  notes?: string
  photos?: string[]
  route?: RouteInfo
  hotelCheckIn?: string // ISO date of the night stayed; presence signals a hotel-stay activity
  flight?: FlightInfo  flightLeg?: 'departure' | 'arrival' // which leg this activity represents}

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
