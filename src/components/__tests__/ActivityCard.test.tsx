import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ActivityCard from '../ActivityCard'
import type { Activity } from '@/lib/types'

// dnd-kit needs a drag context; stub out useSortable so components render without it
vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  verticalListSortingStrategy: {},
  arrayMove: (arr: unknown[]) => arr,
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}))

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 'act1',
    order: 0,
    type: 'poi',
    title: 'Test Activity',
    ...overrides,
  }
}

describe('ActivityCard', () => {
  it('renders the activity title', () => {
    render(<ActivityCard activity={makeActivity()} index={0} />)
    expect(screen.getByText('Test Activity')).toBeInTheDocument()
  })

  it('shows numbered index badge for regular POI', () => {
    render(<ActivityCard activity={makeActivity()} index={2} />)
    expect(screen.getByText('3')).toBeInTheDocument() // index + 1
  })

  it('shows 🏨 emoji badge for hotel-stay activity', () => {
    const hotel = makeActivity({
      title: 'Grand Hotel',
      poi: { name: 'Grand Hotel', lat: 0, lng: 0, category: 'hotel' },
      hotelCheckIn: '2025-03-11',
    })
    render(<ActivityCard activity={hotel} index={0} />)
    expect(screen.getByText('🏨')).toBeInTheDocument()
    // Index number should NOT appear
    expect(screen.queryByText('1')).not.toBeInTheDocument()
  })

  it('does NOT show hotel badge for POI with hotel category but no hotelCheckIn', () => {
    // A hotel POI added without the hotel-stay flow (just categorised as hotel) should still show index
    const act = makeActivity({
      poi: { name: 'Some Hotel', lat: 0, lng: 0, category: 'hotel' },
      // no hotelCheckIn
    })
    render(<ActivityCard activity={act} index={0} />)
    expect(screen.queryByText('🏨')).not.toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('shows address when poi.address is present', () => {
    const act = makeActivity({ poi: { name: 'Place', lat: 0, lng: 0, address: '123 Main St' } })
    render(<ActivityCard activity={act} index={0} />)
    expect(screen.getByText('123 Main St')).toBeInTheDocument()
  })

  it('shows start time when set', () => {
    const act = makeActivity({ startTime: '09:30' })
    render(<ActivityCard activity={act} index={0} />)
    expect(screen.getByText(/09:30/)).toBeInTheDocument()
  })

  it('shows duration alongside time', () => {
    const act = makeActivity({ startTime: '10:00', durationMinutes: 90 })
    render(<ActivityCard activity={act} index={0} />)
    expect(screen.getByText(/10:00 · 90m/)).toBeInTheDocument()
  })

  it('shows notes text', () => {
    const act = makeActivity({ notes: 'Meet at lobby' })
    render(<ActivityCard activity={act} index={0} />)
    expect(screen.getByText('Meet at lobby')).toBeInTheDocument()
  })

  it('calls onSelect when clicked', async () => {
    const onSelect = vi.fn()
    render(<ActivityCard activity={makeActivity()} index={0} onSelect={onSelect} />)
    const card = screen.getByText('Test Activity').closest('div[class*="rounded"]') as HTMLElement | null
    card?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onSelect).toHaveBeenCalled()
  })

  it('renders note activity with sticky note icon (no index)', () => {
    const act = makeActivity({ type: 'note', title: 'A note' })
    render(<ActivityCard activity={act} index={0} />)
    // Number badge should not appear for notes
    expect(screen.queryByText('1')).not.toBeInTheDocument()
  })
})
