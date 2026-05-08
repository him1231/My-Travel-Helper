import { describe, it, expect } from 'vitest'
import { parseFlightText } from '../flightParse'

describe('parseFlightText', () => {
  it('returns empty shape for empty input', () => {
    const r = parseFlightText('')
    expect(r.flightNumber).toBeUndefined()
    expect(r.departure).toEqual({})
    expect(r.arrival).toEqual({})
  })

  it('extracts flight number with space', () => {
    const r = parseFlightText('Your booking on AA 100 is confirmed.')
    expect(r.flightNumber).toBe('AA 100')
  })

  it('extracts flight number without space', () => {
    const r = parseFlightText('Flight: BA284')
    expect(r.flightNumber).toBe('BA 284')
  })

  it('extracts two IATA airport codes as departure and arrival', () => {
    const r = parseFlightText('JFK to LHR on AA 100')
    expect(r.departure?.airportCode).toBe('JFK')
    expect(r.arrival?.airportCode).toBe('LHR')
  })

  it('skips common false-positive 3-letter words', () => {
    const r = parseFlightText('Booking from USA. Flight: AA 100. JFK to LHR. PNR: ABC123')
    expect(r.departure?.airportCode).toBe('JFK')
    expect(r.arrival?.airportCode).toBe('LHR')
  })

  it('extracts 24h times as departure and arrival', () => {
    const r = parseFlightText('AA 100 JFK 14:30 → LHR 02:30')
    expect(r.departure?.time).toContain('14:30')
    expect(r.arrival?.time).toContain('02:30')
  })

  it('converts 12h AM/PM times to 24h', () => {
    const r = parseFlightText('Departs 2:30 PM, arrives 8:45 AM')
    expect(r.departure?.time).toContain('14:30')
    expect(r.arrival?.time).toContain('08:45')
  })

  it('combines date + time into ISO datetime when date is present', () => {
    const r = parseFlightText('Date: 2026-05-08 — Departs 14:30, arrives 18:00')
    expect(r.departure?.time).toBe('2026-05-08T14:30')
    expect(r.arrival?.time).toBe('2026-05-08T18:00')
  })

  it('parses slash date format', () => {
    const r = parseFlightText('5/8/2026 14:30 18:00')
    expect(r.rawDate).toBe('2026-05-08')
  })

  it('parses month-name date', () => {
    const r = parseFlightText('Departing May 8, 2026 at 14:30')
    expect(r.rawDate).toBe('2026-05-08')
  })

  it('extracts confirmation number from labeled text', () => {
    const r = parseFlightText('Confirmation: ABC123\nSeat: 12A')
    expect(r.confirmation).toBe('ABC123')
    expect(r.seat).toBe('12A')
  })

  it('extracts PNR as confirmation', () => {
    const r = parseFlightText('PNR: XYZ987')
    expect(r.confirmation).toBe('XYZ987')
  })

  it('extracts terminal and gate, mapping first to departure', () => {
    const r = parseFlightText(`
      Departure: JFK Terminal: 8 Gate: B12
      Arrival:   LHR Terminal: 5 Gate: A20
    `)
    expect(r.departure?.terminal).toBe('8')
    expect(r.departure?.gate).toBe('B12')
    expect(r.arrival?.terminal).toBe('5')
    expect(r.arrival?.gate).toBe('A20')
  })

  it('detects airline name when present', () => {
    const r = parseFlightText('Your American Airlines booking AA 100 to LHR')
    expect(r.airline).toBe('American Airlines')
  })

  it('handles a realistic confirmation email', () => {
    const text = `
      Your American Airlines flight is confirmed.

      Confirmation: ABC123
      Flight: AA 100
      Date: 2026-05-08

      Departure: New York JFK Terminal: 8 — 14:30
      Arrival:   London  LHR Terminal: 5 — 02:30 (next day)

      Seat: 12A
      Class: Economy
    `
    const r = parseFlightText(text)
    expect(r.flightNumber).toBe('AA 100')
    expect(r.airline).toBe('American Airlines')
    expect(r.confirmation).toBe('ABC123')
    expect(r.departure?.airportCode).toBe('JFK')
    expect(r.arrival?.airportCode).toBe('LHR')
    expect(r.departure?.terminal).toBe('8')
    expect(r.arrival?.terminal).toBe('5')
    expect(r.departure?.time).toBe('2026-05-08T14:30')
    expect(r.arrival?.time).toBe('2026-05-08T02:30')
    expect(r.seat).toBe('12A')
    expect(r.bookingClass).toBe('Economy')
  })
})
