import { describe, expect, it } from 'vitest'
import { formatCurrentGap } from './current-gap-format.ts'

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE

describe('the Current Gap, as Track prints it', () => {
  it.each([
    [59 * SECOND, '0m'],
    [90 * SECOND, '1m'],
    [59 * MINUTE + 59 * SECOND, '59m'],
    [2 * HOUR, '2h 0m'],
    [23 * HOUR + 59 * MINUTE, '23h 59m'],
    [24 * HOUR, '1d 0h'],
    [76 * HOUR, '3d 4h'],
  ])('floors %i ms to %s, coarsening a unit at the hour and at the day', (milliseconds, text) => {
    expect(formatCurrentGap(milliseconds).text).toBe(text)
  })

  it.each([
    [59 * SECOND, '0 minutes'],
    [90 * SECOND, '1 minute'],
    [59 * MINUTE + 59 * SECOND, '59 minutes'],
    [HOUR + MINUTE, '1 hour 1 minute'],
    [2 * HOUR + 14 * MINUTE, '2 hours 14 minutes'],
    [24 * HOUR, '1 day 0 hours'],
    [76 * HOUR, '3 days 4 hours'],
  ])('says %i ms in words, as %s, for a screen reader', (milliseconds, words) => {
    expect(formatCurrentGap(milliseconds).words).toBe(words)
  })
})
