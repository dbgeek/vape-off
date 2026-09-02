import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PuffSession, ResistedUrge } from '../store/records.ts'
import { Lane, LANE_AXES, LIVE_LANE, YESTERDAY_LANE, type LaneAxis } from './Lane.tsx'
import { puffLabel } from './lane-events.ts'

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

  it('hangs each lane on its own custom property and its own spoke', () => {
    // The pairing the axis exists to make unfailable: a lane's room, the
    // property its marks are measured from and the hairline back to its spine
    // travel as one value, so none can be taken from the other lane.
    expect(YESTERDAY_LANE.variable).toBe('--yesterday-spine')
    expect(YESTERDAY_LANE.spokeClass).toBe('yesterday-spoke')
    expect(LIVE_LANE.variable).toBe('--spine')
    expect(LIVE_LANE.spokeClass).toBe('fan-spoke')
  })

  it('carries every lane in LANE_AXES, so no spine goes undeclared', () => {
    expect([...LANE_AXES]).toEqual([YESTERDAY_LANE, LIVE_LANE])
  })
})

/**
 * The timeline an iPhone SE produces, at the height `screens.md` reads its *a
 * 20px mark covers roughly 55 minutes* off — the same box the fan's own fixtures
 * are measured on.
 *
 * Handed straight in as a prop. Where a mark hangs is arithmetic all the way
 * down now, so nothing here has to lay anything out or stub a bounding box.
 */
const TIMELINE = { width: 335, height: 520 }

function session(id: string, wallTime: string, count: number): PuffSession {
  return {
    id,
    at: `2026-08-29T${wallTime}:00.000Z`,
    lastTapAt: `2026-08-29T${wallTime}:00.000Z`,
    count,
    logicalDay: '2026-08-29',
    tz: 'UTC',
  }
}

/** The same session, marked as having delivered a Kick. */
function kicked(session: PuffSession): PuffSession {
  return { ...session, kickMarkedAt: `${session.at.slice(0, 11)}23:00:00.000Z` }
}

function urge(id: string, wallTime: string): ResistedUrge {
  return { id, at: `2026-08-29T${wallTime}:00.000Z`, logicalDay: '2026-08-29', tz: 'UTC' }
}

/** Draws every mark as the same inert span, so only the placing is under test. */
function drawLane(
  axis: LaneAxis,
  puffSessions: readonly PuffSession[],
  resistedUrges: readonly ResistedUrge[] = [],
  headHeight = 0,
) {
  return render(
    <Lane
      axis={axis}
      puffSessions={puffSessions}
      resistedUrges={resistedUrges}
      timeZone="UTC"
      timelineSize={TIMELINE}
      headHeight={headHeight}
      renderMark={(event, mark) => (
        <span
          data-testid="mark"
          style={mark}
          aria-label={event.kind === 'puff' ? puffLabel(event.session, 'UTC') : 'urge'}
        />
      )}
    />,
  )
}

/** Every mark the lane drew, in the order it drew them. */
function marks(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-testid="mark"]')]
}

describe('Lane', () => {
  // Two Puff Sessions four minutes apart, which at this timeline's height is
  // well inside one 36px mark of each other. The arithmetic is `timeline-fan`'s
  // and is tested there; what is under test here is that the answer reaches the
  // right mark, measured from the right spine.
  const colliding = [session('ten', '07:34', 10), session('six', '07:38', 6)]

  it('hands each mark the column the fan computed for it', () => {
    drawLane(LIVE_LANE, colliding)
    const [ten, six] = marks()

    // A mark that collides with nothing keeps the spine, and says so by
    // carrying no inline left at all.
    expect(ten!.style.left).toBe('')
    expect(six!.style.left).toBe('calc(var(--spine) + 40px)')
  })

  it('measures the column from its own lane spine, never the other one', () => {
    drawLane(YESTERDAY_LANE, colliding)
    const [, six] = marks()

    // The same two events, the same column — read off the other spine. This is
    // the pairing that used to be made by hand at each call site.
    expect(six!.style.left).toBe('calc(var(--yesterday-spine) + 40px)')
  })

  it("draws a spoke only for a mark that left the spine, in its own lane's hairline", () => {
    drawLane(YESTERDAY_LANE, colliding)
    const spokes = [...document.querySelectorAll<HTMLElement>('.yesterday-spoke')]

    expect(spokes).toHaveLength(1)
    expect(spokes[0]!.style.width).toBe('40px')
    expect(document.querySelectorAll('.fan-spoke')).toHaveLength(0)
  })

  it('keeps height and size on the mark alongside the column', () => {
    drawLane(LIVE_LANE, [session('ten', '07:34', 10)])
    const [ten] = marks()

    // 07:34 is 3h34m into a Logical Day that opens at 04:00.
    expect(Number.parseFloat(ten!.style.top)).toBeCloseTo((214 / 1440) * 100, 4)
    expect(ten!.style.width).toBe('36px')
    expect(ten!.style.height).toBe('36px')
  })

  it('draws in time order however the events arrive', () => {
    drawLane(LIVE_LANE, [session('late', '20:00', 1)], [urge('early', '09:00')])

    expect(marks().map((mark) => mark.getAttribute('aria-label'))).toEqual([
      'urge',
      'Puff Session, 1 puff at 20:00',
    ])
  })

  it('gives the head the room it measured', () => {
    // An early-morning mark cannot take the spine's own column while the head
    // stands in it — the head is measured, so this is the joining of a measured
    // box to the fan.
    drawLane(YESTERDAY_LANE, [session('dawn', '05:00', 1)], [], 44.5)

    expect(marks()[0]!.style.left).toBe('calc(var(--yesterday-spine) + 24px)')
  })

  it('leaves the spine free to the same mark when no head stands in it', () => {
    drawLane(YESTERDAY_LANE, [session('dawn', '05:00', 1)])

    expect(marks()[0]!.style.left).toBe('')
  })

  it('places a Kicked mark exactly where it placed the unkicked one', () => {
    // **Marking a mark moves no mark.** The halo is drawn outside the box and
    // the fan is never taught it (`screens.md` § When marks collide — the fan):
    // teaching it would tip this very run, because the column step is the
    // group's widest mark. A day where every mark has to move to answer a
    // collision, drawn twice.
    const day = [
      session('dawn', '05:00', 1),
      session('ten', '07:34', 10),
      session('six', '07:38', 6),
      session('evening', '20:58', 1),
      session('four', '21:03', 4),
      session('two', '21:07', 2),
    ]
    const placements = () =>
      marks().map(({ style }) => [style.top, style.left, style.width, style.height])

    drawLane(LIVE_LANE, day, [urge('ring', '21:05')])
    const unkicked = placements()
    document.body.replaceChildren()
    drawLane(LIVE_LANE, day.map(kicked), [urge('ring', '21:05')])

    expect(placements()).toEqual(unkicked)
    expect(unkicked.some(([, left]) => left !== '')).toBe(true)
  })

  it('draws only what the caller returns, inventing no handle of its own', () => {
    // What keeps the Yesterday lane read-only *hard*: the module never decides
    // that a mark is tappable, so a lane with nothing to give a mark cannot
    // acquire one.
    drawLane(YESTERDAY_LANE, colliding)

    expect(document.querySelectorAll('button')).toHaveLength(0)
    expect(marks()).toHaveLength(2)
  })
})
