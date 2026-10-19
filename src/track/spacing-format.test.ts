import { describe, expect, it } from 'vitest'
import { formatSpacing } from './spacing-format.ts'

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE

describe('Spacing, as Track prints it', () => {
  it.each([
    [30 * SECOND, 'Next in 1m · 4 puffs'],
    [13 * MINUTE + 30 * SECOND, 'Next in 14m · 4 puffs'],
    [59 * MINUTE, 'Next in 59m · 4 puffs'],
    [59 * MINUTE + 1 * SECOND, 'Next in 1h 0m · 4 puffs'],
    [HOUR + 59 * MINUTE + 30 * SECOND, 'Next in 2h 0m · 4 puffs'],
    [HOUR + 20 * MINUTE, 'Next in 1h 20m · 4 puffs'],
    [15 * HOUR + 58 * MINUTE + 1 * SECOND, 'Next in 15h 59m · 4 puffs'],
  ])('rounds %i ms up to the minute, keeping two units from the hour', (milliseconds, text) => {
    expect(formatSpacing(milliseconds, 4).text).toBe(text)
  })

  it.each([0, -1, -3 * HOUR])('reads now at and past the due time (%i ms), never late', (milliseconds) => {
    expect(formatSpacing(milliseconds, 4)).toEqual({
      text: 'Next · now · 4 puffs',
      words: 'Spacing, due now, 4 puffs',
    })
  })

  it('counts a single puff in the singular', () => {
    expect(formatSpacing(14 * MINUTE, 1).text).toBe('Next in 14m · 1 puff')
    expect(formatSpacing(0, 1).words).toBe('Spacing, due now, 1 puff')
  })

  it.each([
    [HOUR + 20 * MINUTE, 'Spacing, next in 1 hour 20 minutes, 4 puffs'],
    [14 * MINUTE, 'Spacing, next in 14 minutes, 4 puffs'],
    [30 * SECOND, 'Spacing, next in 1 minute, 4 puffs'],
    [2 * HOUR, 'Spacing, next in 2 hours 0 minutes, 4 puffs'],
  ])('says %i ms in words, as %s, for a screen reader', (milliseconds, words) => {
    expect(formatSpacing(milliseconds, 4).words).toBe(words)
  })
})
