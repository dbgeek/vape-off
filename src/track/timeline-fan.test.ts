import { describe, expect, it } from 'vitest'
import { fanOffsets, type FannedEvent } from './timeline-fan.ts'
import { liveLaneWidth, markSize, RESISTED_URGE_RING_SIZE } from './timeline-geometry.ts'

const MINUTES_PER_DAY = 24 * 60

/** The height a wall time hangs at, on the uniform 04:00-to-04:00 axis. */
function heightOf(wallTime: string): number {
  const [hour, minute] = wallTime.split(':').map(Number)
  return (((hour! * 60 + minute! - 4 * 60 + MINUTES_PER_DAY) % MINUTES_PER_DAY) / MINUTES_PER_DAY) * 100
}

function session(wallTime: string, count: number): FannedEvent {
  return { top: heightOf(wallTime), size: markSize(count) }
}

function resistedUrge(wallTime: string): FannedEvent {
  return { top: heightOf(wallTime), size: RESISTED_URGE_RING_SIZE }
}

/** The timeline an iPhone SE produces, which is what the fan was measured on. */
const PHONE_TIMELINE_WIDTH = 335

/**
 * The lane the fan was measured against: that phone's timeline at the height
 * `screens.md` reads its *a 20px mark covers roughly 55 minutes* off — 1440
 * minutes over 520px — and whatever room the live lane has on it.
 */
const MEASURED_LANE = { height: 520, width: liveLaneWidth(PHONE_TIMELINE_WIDTH) }

/** The same phone once `T5`'s floor binds, which is the tightest lane there is. */
const FLOOR_LANE = { height: 224, width: liveLaneWidth(PHONE_TIMELINE_WIDTH) }

/** The reported screen: a 2, a Resisted Urge, then the `10` / `6` blob. */
const reportedBlob: FannedEvent[] = [
  session('06:20', 2),
  resistedUrge('07:05'),
  session('07:34', 10),
  session('07:38', 6),
]

/** `21:30, sixteen sessions` — no pair close in time, and the worst screen there is. */
const sixteenSessionEvening: FannedEvent[] = [
  session('06:05', 1),
  session('07:20', 2),
  session('08:02', 1),
  session('09:15', 3),
  session('10:40', 1),
  session('11:05', 2),
  resistedUrge('11:50'),
  session('12:35', 1),
  session('13:50', 2),
  session('15:10', 1),
  session('16:25', 4),
  session('17:40', 1),
  resistedUrge('18:10'),
  session('18:30', 2),
  session('19:04', 3),
  session('19:55', 2),
  session('20:40', 5),
  session('21:12', 1),
]

/** `21:40, a run of four in fourteen minutes` — four sessions and a ring inside one stretch. */
const eveningRun: FannedEvent[] = [
  session('06:05', 1),
  session('08:02', 2),
  session('10:40', 1),
  resistedUrge('11:50'),
  session('13:50', 3),
  session('16:25', 4),
  session('18:30', 2),
  session('20:58', 1),
  session('21:03', 4),
  resistedUrge('21:05'),
  session('21:07', 2),
  session('21:12', 1),
]

describe('fanOffsets', () => {
  it('steps the reported 10 / 6 pair one column apart, at its own two heights', () => {
    const offsets = fanOffsets(reportedBlob, MEASURED_LANE)

    // The whole morning chains: 06:20 and the ring touch, the ring and the 10
    // touch, the 10 and the 6 touch. The widest mark in the group is the 36px
    // that 10 puffs opens, so the step is 40px.
    expect(offsets).toEqual([0, 40, 80, 120])
    // The 6 sits one column right of the 10, and four minutes below it.
    expect(offsets[3]! - offsets[2]!).toBe(40)
    expect(reportedBlob[3]!.top).toBeGreaterThan(reportedBlob[2]!.top)
  })

  it('resolves a sixteen-session evening in three columns, on the timeline it was measured on', () => {
    const offsets = fanOffsets(sixteenSessionEvening, MEASURED_LANE)

    // No pair here is close in time: it is the evening's scale alone that has
    // them touching. The day breaks into groups that step by their own widest
    // mark — 24px where that is a 20px mark, 32px where it is the 28px a
    // 3-puff session opens — and the deepest of them needs three columns, so
    // the fan reaches exactly two steps out and no further.
    expect(new Set(offsets)).toEqual(new Set([0, 24, 32, 64]))
    expect(Math.max(...offsets)).toBe(2 * 32)
  })

  it('resolves a run of four inside fourteen minutes in five columns', () => {
    const offsets = fanOffsets(eveningRun, MEASURED_LANE)

    // The run is its own group — 18:30 clears everything after it — so the five
    // columns are the five events from 20:58 to 21:12, stepping by the 28px
    // that the 21:03 session's 4 puffs open.
    expect(offsets.slice(7)).toEqual([0, 32, 64, 96, 128])
    expect(offsets.slice(0, 7)).toEqual([0, 0, 0, 0, 0, 0, 0])
  })

  it('colours into the leftmost free column rather than stepping every member', () => {
    // A chain of five, each touching only its neighbour: 1 and 3 do not touch,
    // so the third mark comes back to the spine instead of walking right.
    const chain = ['20:00', '20:35', '21:10', '21:45', '22:20'].map((time) => session(time, 1))

    expect(fanOffsets(chain, MEASURED_LANE)).toEqual([0, 24, 0, 24, 0])
  })

  it('leaves an event that collides with nothing on the spine', () => {
    const sparse = [session('08:00', 3), session('12:00', 1), resistedUrge('16:00')]

    expect(fanOffsets(sparse, MEASURED_LANE)).toEqual([0, 0, 0])
  })

  it('steps by the widest mark in that group, not by a global constant', () => {
    const smallPair = [session('08:00', 1), session('08:20', 1)]
    const largePair = [session('08:00', 11), session('08:20', 11)]

    expect(fanOffsets(smallPair, MEASURED_LANE)[1]).toBe(markSize(1) + 4)
    expect(fanOffsets(largePair, MEASURED_LANE)[1]).toBe(markSize(11) + 4)
  })

  it('fans a Resisted Urge ring with everything else, at its own size', () => {
    const ringOnMark = [session('15:12', 2), resistedUrge('15:12')]

    // Same minute, so the ring cannot stay on the spine — and the group's
    // widest is the 20px mark rather than the 14px ring.
    expect(fanOffsets(ringOnMark, MEASURED_LANE)).toEqual([0, 24])
  })

  it('places in time order however the events arrive', () => {
    const shuffled = [reportedBlob[3]!, reportedBlob[0]!, reportedBlob[2]!, reportedBlob[1]!]

    expect(fanOffsets(shuffled, MEASURED_LANE)).toEqual([120, 0, 80, 40])
  })

  it('never moves a mark vertically, and never merges two', () => {
    const before = sixteenSessionEvening.map((event) => ({ ...event }))
    const offsets = fanOffsets(sixteenSessionEvening, MEASURED_LANE)

    expect(offsets).toHaveLength(sixteenSessionEvening.length)
    expect(sixteenSessionEvening).toEqual(before)
  })

  it('gives the outermost column the remainder rather than clipping a session away', () => {
    const clique = ['21:00', '21:03', '21:06', '21:09', '21:12'].map((time) => session(time, 1))
    // Room for two columns only: 24px of step, and the second column's 20px
    // mark has to keep its whole circle inside the lane.
    const narrow = { height: MEASURED_LANE.height, width: 34 }

    const offsets = fanOffsets(clique, narrow)

    expect(offsets).toEqual([0, 24, 24, 24, 24])
    expect(Math.max(...offsets) + markSize(1) / 2).toBeLessThanOrEqual(narrow.width)
  })

  it('keeps every fixture inside the lane, at the floor the timeline is allowed to reach', () => {
    for (const events of [reportedBlob, sixteenSessionEvening, eveningRun]) {
      const offsets = fanOffsets(events, FLOOR_LANE)
      const widest = Math.max(
        ...offsets.map((offset, index) => offset + events[index]!.size / 2),
      )

      expect(widest).toBeLessThanOrEqual(FLOOR_LANE.width)
    }
  })

  it('answers a shorter timeline with more columns, not with a mark it drops', () => {
    // How many columns a day needs is a reading of its own density against the
    // height it is drawn at — a shorter timeline packs more marks into each
    // collision, and the fan pays for it sideways. The evening that resolves in
    // three columns at 520px wants five once `T5`'s floor binds, and the floor
    // is exactly the height at which those five still fit the lane.
    expect(Math.max(...fanOffsets(sixteenSessionEvening, MEASURED_LANE))).toBe(2 * 32)
    expect(Math.max(...fanOffsets(sixteenSessionEvening, FLOOR_LANE))).toBe(4 * 32)
  })

  it('places nothing when there is nothing to place', () => {
    expect(fanOffsets([], MEASURED_LANE)).toEqual([])
  })

  it('draws every mark on the spine before the lane has been measured', () => {
    // The first paint has no size to read, and a fan is a distance in pixels.
    // Everything on the spine is the honest drawing of *not measured yet*.
    expect(fanOffsets(reportedBlob, { height: 0, width: 0 })).toEqual([0, 0, 0, 0])
  })
})
