import { describe, expect, it } from 'vitest'
import { markSize, timelinePosition } from './timeline-geometry.ts'

const STOCKHOLM = 'Europe/Stockholm'

/** A wall time, `HH:MM` or `HH:MM:SS`, on a summer day Stockholm spends at +02:00. */
function at(wallTime: string): Date {
  const [hour, minute, second = '00'] = wallTime.split(':')
  return new Date(`2026-08-29T${hour}:${minute}:${second}.000+02:00`)
}

describe('timelinePosition', () => {
  it('puts now at the middle of the timeline', () => {
    expect(timelinePosition(at('10:00'), at('10:00'), STOCKHOLM)).toBe(50)
  })

  it('opens the lived half at the top of the Logical Day', () => {
    expect(timelinePosition(at('04:00'), at('10:00'), STOCKHOLM)).toBe(0)
  })

  it('spreads what has been lived across the top half', () => {
    // 07:00 is halfway from the 04:00 boundary to a 10:00 now.
    expect(timelinePosition(at('07:00'), at('10:00'), STOCKHOLM)).toBeCloseTo(25)
  })

  it('spreads what is still ahead across the bottom half', () => {
    // 22:00 is two thirds of the way from a 10:00 now to the 04:00 boundary.
    expect(timelinePosition(at('22:00'), at('10:00'), STOCKHOLM)).toBeCloseTo(83.3333, 4)
  })

  it('closes the day just short of the bottom', () => {
    expect(timelinePosition(at('03:59'), at('10:00'), STOCKHOLM)).toBeCloseTo(99.9537, 4)
  })

  it('has no lived half to divide by at the moment the Logical Day opens', () => {
    expect(timelinePosition(at('04:00'), at('04:00'), STOCKHOLM)).toBe(0)
  })

  it('has a whole half left for the last minute of the day', () => {
    expect(timelinePosition(at('03:59:30'), at('03:59'), STOCKHOLM)).toBeCloseTo(75)
  })

  it('reads an Instant the same way it reads a Date', () => {
    expect(timelinePosition('2026-08-29T05:00:00.000+02:00', at('10:00'), STOCKHOLM)).toBeCloseTo(
      timelinePosition(at('05:00'), at('10:00'), STOCKHOLM),
    )
  })

  it('places the same instants differently in a different zone', () => {
    // 10:00 in Stockholm is 04:00 in New York, where the Logical Day has only
    // just opened, so the same event sits at the top rather than a quarter down.
    expect(timelinePosition(at('10:00'), at('16:00'), STOCKHOLM)).toBeCloseTo(25)
    expect(timelinePosition(at('10:00'), at('16:00'), 'America/New_York')).toBe(0)
  })
})

describe('markSize', () => {
  it('grows with the square root of the count', () => {
    expect(markSize(1)).toBe(19)
    expect(markSize(4)).toBe(26)
    expect(markSize(9)).toBe(33)
  })

  it('starts from a floor a countless mark would still be drawn at', () => {
    expect(markSize(0)).toBe(12)
  })

  it('is still growing just short of the cap', () => {
    expect(markSize(20)).toBeCloseTo(43.305, 3)
  })

  it('stops growing at 44px', () => {
    expect(markSize(21)).toBe(44)
    expect(markSize(100)).toBe(44)
  })
})
