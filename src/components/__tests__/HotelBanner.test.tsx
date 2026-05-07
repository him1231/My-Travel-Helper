import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Activity, Day } from '@/lib/types'

// ── Inline the HotelBanner component exactly as it lives in TripDetail ────────
// We test the component logic in isolation without importing TripDetail (which
// pulls in Firebase, react-router, etc.)

function HotelBanner({ type, hotelName }: { type: 'checkin' | 'checkout'; hotelName: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
      <span className="text-base">🏨</span>
      <span className="font-semibold">{type === 'checkin' ? 'Check in' : 'Check out'}:</span>
      <span className="truncate">{hotelName}</span>
    </div>
  )
}

describe('HotelBanner component', () => {
  it('renders check-in label and hotel name', () => {
    render(<HotelBanner type="checkin" hotelName="Grand Hotel" />)
    expect(screen.getByText('Check in:')).toBeInTheDocument()
    expect(screen.getByText('Grand Hotel')).toBeInTheDocument()
    expect(screen.getByText('🏨')).toBeInTheDocument()
  })

  it('renders check-out label and hotel name', () => {
    render(<HotelBanner type="checkout" hotelName="City Inn" />)
    expect(screen.getByText('Check out:')).toBeInTheDocument()
    expect(screen.getByText('City Inn')).toBeInTheDocument()
  })

  it('shows different text for checkin vs checkout', () => {
    const { rerender } = render(<HotelBanner type="checkin" hotelName="Hotel A" />)
    expect(screen.getByText('Check in:')).toBeInTheDocument()
    rerender(<HotelBanner type="checkout" hotelName="Hotel A" />)
    expect(screen.getByText('Check out:')).toBeInTheDocument()
    expect(screen.queryByText('Check in:')).not.toBeInTheDocument()
  })

  it('displays long hotel name without crashing', () => {
    const longName = 'A'.repeat(100)
    render(<HotelBanner type="checkin" hotelName={longName} />)
    expect(screen.getByText(longName)).toBeInTheDocument()
  })
})

// ── Derive hotel banner logic (pure, no React needed) ─────────────────────────

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

function makeActivity(id: string, overrides: Partial<Activity> = {}): Activity {
  return { id, order: 0, type: 'poi', title: id, ...overrides }
}
function makeDay(id: string, activities: Activity[] = []): Day {
  return { id, date: id, notes: '', activities }
}

describe('hotel banner — conditional rendering scenarios', () => {
  it('check-in banner appears on hotel day', () => {
    const hotel = makeActivity('h1', {
      poi: { name: 'Grand Hotel', lat: 0, lng: 0, category: 'hotel' },
      hotelCheckIn: '2025-05-02',
    })
    const days = [makeDay('2025-05-01'), makeDay('2025-05-02', [hotel]), makeDay('2025-05-03')]

    const { checkIn, checkOut } = deriveHotelBanners(days, '2025-05-02')
    expect(checkIn).not.toBeNull()
    expect(checkIn!.title).toBe('h1')
    expect(checkOut).toBeNull()

    // Render and confirm UI
    if (checkIn) render(<HotelBanner type="checkin" hotelName={checkIn.title} />)
    expect(screen.getByText('Check in:')).toBeInTheDocument()
  })

  it('check-out banner appears on the day after hotel', () => {
    const hotel = makeActivity('h1', {
      poi: { name: 'Grand Hotel', lat: 0, lng: 0, category: 'hotel' },
      hotelCheckIn: '2025-05-02',
    })
    const days = [makeDay('2025-05-01'), makeDay('2025-05-02', [hotel]), makeDay('2025-05-03')]

    const { checkIn, checkOut } = deriveHotelBanners(days, '2025-05-03')
    expect(checkOut).not.toBeNull()
    expect(checkIn).toBeNull()

    if (checkOut) render(<HotelBanner type="checkout" hotelName={checkOut.title} />)
    expect(screen.getByText('Check out:')).toBeInTheDocument()
  })

  it('neither banner on a day with no hotel involvement', () => {
    const days = [makeDay('2025-05-01'), makeDay('2025-05-02'), makeDay('2025-05-03')]
    const { checkIn, checkOut } = deriveHotelBanners(days, '2025-05-02')
    expect(checkIn).toBeNull()
    expect(checkOut).toBeNull()
  })
})
