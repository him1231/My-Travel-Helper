import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { addDaysISO, todayISO, formatMoney, stripUndefinedDeep } from '../utils'

// ── addDaysISO ────────────────────────────────────────────────────────────────

describe('addDaysISO', () => {
  it('adds positive days', () => {
    expect(addDaysISO('2025-03-10', 1)).toBe('2025-03-11')
    expect(addDaysISO('2025-03-10', 5)).toBe('2025-03-15')
  })

  it('adds zero days returns same date', () => {
    expect(addDaysISO('2025-06-01', 0)).toBe('2025-06-01')
  })

  it('subtracts days with negative value', () => {
    expect(addDaysISO('2025-03-10', -1)).toBe('2025-03-09')
    expect(addDaysISO('2025-03-01', -1)).toBe('2025-02-28')
  })

  it('crosses month boundary correctly', () => {
    expect(addDaysISO('2025-01-31', 1)).toBe('2025-02-01')
    expect(addDaysISO('2025-03-31', 1)).toBe('2025-04-01')
  })

  it('crosses year boundary correctly', () => {
    expect(addDaysISO('2024-12-31', 1)).toBe('2025-01-01')
    expect(addDaysISO('2025-01-01', -1)).toBe('2024-12-31')
  })

  it('handles leap year Feb 28 → Feb 29', () => {
    expect(addDaysISO('2024-02-28', 1)).toBe('2024-02-29')
  })

  it('handles leap year Feb 29 → Mar 1', () => {
    expect(addDaysISO('2024-02-29', 1)).toBe('2024-03-01')
  })

  it('non-leap year Feb 28 → Mar 1', () => {
    expect(addDaysISO('2025-02-28', 1)).toBe('2025-03-01')
  })

  it('large offset works correctly', () => {
    expect(addDaysISO('2025-01-01', 365)).toBe('2026-01-01')
  })
})

// ── todayISO ──────────────────────────────────────────────────────────────────

describe('todayISO', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns YYYY-MM-DD format', () => {
    vi.setSystemTime(new Date('2025-06-15T10:00:00'))
    expect(todayISO()).toBe('2025-06-15')
  })

  it('pads month and day with leading zero', () => {
    vi.setSystemTime(new Date('2025-01-05T00:00:00'))
    expect(todayISO()).toBe('2025-01-05')
  })
})

// ── formatMoney ───────────────────────────────────────────────────────────────

describe('formatMoney', () => {
  it('falls back gracefully for truly invalid currency code', () => {
    // Single-char codes are always invalid per ISO 4217 — Intl throws, fallback runs
    expect(formatMoney(42, 'X')).toBe('42 X')
  })

  it('formats zero', () => {
    // Just check it does not throw and contains 0
    const result = formatMoney(0, 'USD')
    expect(result).toContain('0')
  })

  it('formats a positive amount without throwing', () => {
    const result = formatMoney(1234.5, 'USD')
    expect(result).toBeTruthy()
    expect(typeof result).toBe('string')
  })
})

// ── stripUndefinedDeep ────────────────────────────────────────────────────────

describe('stripUndefinedDeep', () => {
  it('removes top-level undefined values', () => {
    const input = { a: 1, b: undefined, c: 'hello' }
    const result = stripUndefinedDeep(input)
    expect(result).toEqual({ a: 1, c: 'hello' })
    expect('b' in result).toBe(false)
  })

  it('removes nested undefined values', () => {
    const input = { outer: { inner: undefined, keep: 42 } }
    const result = stripUndefinedDeep(input)
    expect(result.outer).toEqual({ keep: 42 })
  })

  it('preserves null values', () => {
    const input = { a: null, b: undefined }
    const result = stripUndefinedDeep(input)
    expect(result.a).toBeNull()
    expect('b' in result).toBe(false)
  })

  it('preserves arrays', () => {
    const input = { items: [1, 2, 3] }
    expect(stripUndefinedDeep(input)).toEqual({ items: [1, 2, 3] })
  })

  it('handles empty object', () => {
    expect(stripUndefinedDeep({})).toEqual({})
  })

  it('handles plain strings and numbers unchanged', () => {
    expect(stripUndefinedDeep('hello')).toBe('hello')
    expect(stripUndefinedDeep(42)).toBe(42)
  })
})
