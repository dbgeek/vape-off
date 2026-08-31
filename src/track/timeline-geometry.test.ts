import { describe, expect, it } from 'vitest'
import { markSize, timelinePosition } from './timeline-geometry.ts'

const STOCKHOLM = 'Europe/Stockholm'

/** A wall time, `HH:MM` or `HH:MM:SS`, on a summer day Stockholm spends at +02:00. */
function at(wallTime: string, day = '2026-08-29'): Date {
  const [hour, minute, second = '00'] = wallTime.split(':')
  return new Date(`${day}T${hour}:${minute}:${second}.000+02:00`)
}

describe('timelinePosition', () => {
  it('opens the Logical Day at the very top', () => {
    expect(timelinePosition(at('04:00'), STOCKHOLM)).toBe(0)
  })

  it('closes the Logical Day at the very bottom', () => {
    // 03:59:59 is the last second before the boundary comes round again.
    expect(timelinePosition(at('03:59:59'), STOCKHOLM)).toBeCloseTo(99.9988, 3)
  })

  it('spreads the Logical Day linearly, so equal distance is equal time', () => {
    expect(timelinePosition(at('10:00'), STOCKHOLM)).toBeCloseTo(25)
    expect(timelinePosition(at('16:00'), STOCKHOLM)).toBeCloseTo(50)
    expect(timelinePosition(at('22:00'), STOCKHOLM)).toBeCloseTo(75)
  })

  it('keeps two minutes two minutes apart at the top of the day', () => {
    // The two-band mapping put these 40% apart. One minute is 1/1440 of the day.
    const gap = timelinePosition(at('04:03'), STOCKHOLM) - timelinePosition(at('04:01'), STOCKHOLM)
    expect(gap).toBeCloseTo(0.1389, 4)
  })

  it('draws the same wall time at the same height on any two days', () => {
    expect(timelinePosition(at('19:00', '2026-08-29'), STOCKHOLM)).toBe(
      timelinePosition(at('19:00', '2026-06-14'), STOCKHOLM),
    )
  })

  it('puts the small hours near the bottom, inside the day that began yesterday', () => {
    expect(timelinePosition(at('01:00'), STOCKHOLM)).toBeCloseTo(87.5)
  })

  it('reads an Instant the same way it reads a Date', () => {
    expect(timelinePosition('2026-08-29T05:00:00.000+02:00', STOCKHOLM)).toBeCloseTo(
      timelinePosition(at('05:00'), STOCKHOLM),
    )
  })

  it('places the same instant differently in a different zone', () => {
    // 10:00 in Stockholm is 04:00 in New York, where the Logical Day has only
    // just opened, so the same instant sits at the top rather than a quarter down.
    expect(timelinePosition(at('10:00'), STOCKHOLM)).toBeCloseTo(25)
    expect(timelinePosition(at('10:00'), 'America/New_York')).toBe(0)
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
