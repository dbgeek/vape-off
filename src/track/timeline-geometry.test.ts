import { describe, expect, it } from 'vitest'
import {
  liveLaneWidth,
  LIVE_LANE_SPINE,
  markSize,
  RESISTED_URGE_RING_SIZE,
  timelinePosition,
  yesterdayLaneWidth,
  YESTERDAY_LANE_SPINE,
} from './timeline-geometry.ts'

const STOCKHOLM = 'Europe/Stockholm'

/**
 * A wall time, `HH:MM` or `HH:MM:SS`, read on `onDate` — a summer date Stockholm
 * spends at +02:00, so the offset is the same whichever of them is used.
 */
function at(wallTime: string, onDate = '2026-08-29'): Date {
  const [hour, minute, second = '00'] = wallTime.split(':')
  return new Date(`${onDate}T${hour}:${minute}:${second}.000+02:00`)
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

  it('keeps two minutes two minutes apart at the top of the Logical Day', () => {
    // The two-band mapping put these 40% apart. One minute is 1/1440 of the
    // Logical Day.
    const gap = timelinePosition(at('04:03'), STOCKHOLM) - timelinePosition(at('04:01'), STOCKHOLM)
    expect(gap).toBeCloseTo(0.1389, 4)
  })

  it('draws the same wall time at the same height on any two Logical Days', () => {
    expect(timelinePosition(at('19:00', '2026-08-29'), STOCKHOLM)).toBe(
      timelinePosition(at('19:00', '2026-06-14'), STOCKHOLM),
    )
  })

  it('puts the small hours near the bottom, inside the Logical Day that began yesterday', () => {
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
  it('draws each of the four tiers at its own size', () => {
    expect(markSize(1)).toBe(20)
    expect(markSize(4)).toBe(28)
    expect(markSize(8)).toBe(36)
    expect(markSize(20)).toBe(44)
  })

  it('steps at the exact boundaries', () => {
    expect(markSize(2)).toBe(20)
    expect(markSize(3)).toBe(28)
    expect(markSize(5)).toBe(28)
    expect(markSize(6)).toBe(36)
    expect(markSize(10)).toBe(36)
    expect(markSize(11)).toBe(44)
  })

  it('makes a 2-puff and a 3-puff session visibly different marks', () => {
    expect(markSize(3) - markSize(2)).toBe(8)
  })

  it('stops at the top tier, however heavy the session', () => {
    expect(markSize(40)).toBe(44)
    expect(markSize(400)).toBe(44)
  })

  it('draws a countless mark at the smallest tier rather than at nothing', () => {
    expect(markSize(0)).toBe(20)
  })
})

describe('RESISTED_URGE_RING_SIZE', () => {
  it('is fixed, and smaller than the smallest mark it has to be told apart from', () => {
    expect(RESISTED_URGE_RING_SIZE).toBe(14)
    expect(RESISTED_URGE_RING_SIZE).toBeLessThan(markSize(1))
  })
})

describe('the two lanes', () => {
  it('stands the spines where the two-lane timeline puts them', () => {
    expect(YESTERDAY_LANE_SPINE).toBe(16)
    expect(LIVE_LANE_SPINE).toBe(46)
  })

  it('gives the Yesterday lane the gap between the two spines', () => {
    expect(yesterdayLaneWidth(1000)).toBeCloseTo(300)
  })

  it('gives the live lane everything right of its own spine', () => {
    expect(liveLaneWidth(1000)).toBeCloseTo(540)
  })

  it('stops the Yesterday lane exactly where the live lane begins', () => {
    // The lane's budget is the gap itself, so the two numbers cannot drift
    // apart: yesterday's spine plus its width is the live lane's spine.
    const timeline = 335
    expect((YESTERDAY_LANE_SPINE / 100) * timeline + yesterdayLaneWidth(timeline)).toBeCloseTo(
      (LIVE_LANE_SPINE / 100) * timeline,
    )
  })
})
