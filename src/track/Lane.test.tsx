import { describe, expect, it } from 'vitest'
import { LANE_AXES, LIVE_LANE, YESTERDAY_LANE } from './Lane.tsx'

describe('the two lanes', () => {
  it('stands the spines where the two-lane timeline puts them', () => {
    expect(YESTERDAY_LANE.spine).toBe(16)
    expect(LIVE_LANE.spine).toBe(46)
  })

  it('gives the Yesterday lane the gap between the two spines', () => {
    expect(YESTERDAY_LANE.roomFor(1000)).toBeCloseTo(300)
  })

  it('gives the live lane everything right of its own spine', () => {
    expect(LIVE_LANE.roomFor(1000)).toBeCloseTo(540)
  })

  it('stops the Yesterday lane exactly where the live lane begins', () => {
    // The lane's budget is the gap itself, so the two numbers cannot drift
    // apart: yesterday's spine plus its room is the live lane's spine.
    const timeline = 335
    expect(
      (YESTERDAY_LANE.spine / 100) * timeline + YESTERDAY_LANE.roomFor(timeline),
    ).toBeCloseTo((LIVE_LANE.spine / 100) * timeline)
  })

  it('hangs each lane on its own custom property', () => {
    // The pairing the axis exists to make unfailable: a lane's room and the
    // property its marks are measured from travel as one value, so neither can
    // be taken from the other lane.
    expect(YESTERDAY_LANE.variable).toBe('--yesterday-spine')
    expect(LIVE_LANE.variable).toBe('--spine')
  })

  it('carries every lane in LANE_AXES, so no spine goes undeclared', () => {
    expect([...LANE_AXES]).toEqual([YESTERDAY_LANE, LIVE_LANE])
  })
})
