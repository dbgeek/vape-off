import { Fragment, useMemo, type CSSProperties, type ReactNode } from 'react'
import type { PuffSession, ResistedUrge } from '../store/records.ts'
import { laneEvents, type LaneEvent } from './lane-events.ts'
import { fanOffsets } from './timeline-fan.ts'
import { type TimelineSize } from './timeline-geometry.ts'

/**
 * A lane of the Track timeline: one Logical Day's events, hung on the shared
 * axis and fanned sideways into its own room (`screens.md` § The two lanes).
 *
 * There are exactly two, and the spec means it — a lane whose identity depended
 * on where your gaps are "would put a third Logical Day on Track in all but
 * name". `LaneAxis` is a type rather than a closed union anyway, because the
 * point is not to make a third lane impossible to write; it is to make the facts
 * about one lane impossible to pull apart.
 */

/** One lane's spine, named as the stylesheet knows it. */
export type SpineVariable = '--spine' | '--yesterday-spine'

/**
 * One lane's axis: the facts that must never be paired with another lane's.
 *
 * They travel as one value because separately they are four chances to get the
 * same lane wrong. A width computed for the live lane and a spine property named
 * for yesterday's is a lane that fans silently into the other one's room, and
 * nothing about it looks wrong at the call site — the numbers are both real and
 * both correct for *some* lane.
 */
export interface LaneAxis {
  /** Where this lane's spine stands, as a percentage of the timeline's width. */
  readonly spine: number
  /** The custom property `index.css` hangs this lane's contents on. */
  readonly variable: SpineVariable
  /** The hairline back to this lane's spine, as the stylesheet draws it. */
  readonly spokeClass: string
  /**
   * How much room this lane has to fan into, in px, on a timeline this wide.
   *
   * A function of the timeline's measured width rather than a number, because
   * the timeline rescales with the room it is given and the lanes divide
   * whatever it ends up with. Fitting a lane to the *room* is not fitting it to
   * the record (ADR 0013).
   */
  readonly roomFor: (timelineWidth: number) => number
}

/**
 * Where the two spines stand, as percentages of the timeline's width.
 *
 * Here rather than in the stylesheet because two things need the same numbers
 * and only one of them is CSS: `index.css` draws each axis and hangs every mark
 * on it through `--spine` and `--yesterday-spine`, which `TrackScreen` sets from
 * these, and the fan needs them to know how much room each lane has.
 *
 * Yesterday sits left of today and both lanes fan right, so the reading
 * direction never changes and yesterday fans into the gap between the two.
 */
const YESTERDAY_SPINE = 16

/** @see YESTERDAY_SPINE */
const LIVE_SPINE = 46

/**
 * The Yesterday lane: the previous Logical Day, dim, read-only.
 *
 * Its room is the gap between the two spines and no wider — yesterday fans
 * right, so its budget runs out exactly where the live lane's spine stands.
 * Derived from the two spines rather than written down as its own ~30% for the
 * same reason the spines are constants: a third number is a third thing that can
 * disagree.
 */
export const YESTERDAY_LANE: LaneAxis = {
  spine: YESTERDAY_SPINE,
  variable: '--yesterday-spine',
  spokeClass: 'yesterday-spoke',
  roomFor: (timelineWidth) => timelineWidth * ((LIVE_SPINE - YESTERDAY_SPINE) / 100),
}

/**
 * The live lane: today's marks and rings.
 *
 * It owns everything right of its spine — nothing is drawn beyond it — so that
 * is the whole of its fan's budget.
 */
export const LIVE_LANE: LaneAxis = {
  spine: LIVE_SPINE,
  variable: '--spine',
  spokeClass: 'fan-spoke',
  roomFor: (timelineWidth) => timelineWidth * (1 - LIVE_SPINE / 100),
}

/**
 * Both lanes, for the one caller that needs them together: `TrackScreen` sets
 * every spine property on the timeline in one pass, so adding a lane cannot
 * leave its custom property undeclared.
 */
export const LANE_AXES: readonly LaneAxis[] = [YESTERDAY_LANE, LIVE_LANE]

/**
 * Where a lane draws one event: its height on the axis, its column right of its
 * lane's spine, and its own drawn size.
 *
 * Internal, because the column and the spine it is measured from are the one
 * pairing this module exists to keep welded together — an offset handed out
 * without the axis it was computed against is the bug in a returnable form.
 */
function markPlacement(event: LaneEvent, offset: number, axis: LaneAxis): CSSProperties {
  return {
    top: `${event.top}%`,
    // A mark that collides with nothing stays on the spine, and says so by
    // carrying no inline left at all.
    left: offset === 0 ? undefined : `calc(var(${axis.variable}) + ${offset}px)`,
    width: `${event.size}px`,
    height: `${event.size}px`,
  }
}

/**
 * One lane's marks, fanned and placed.
 *
 * **What the lane draws is the caller's, and only that.** `renderMark` is handed
 * an event and the style it must wear, and everything else — the axis, the
 * ordering, the fan, the spokes — is settled here. Both lanes ask the same four
 * questions in the same order, and asking them at two call sites was four
 * chances each to answer one of them differently.
 *
 * The render prop is also what keeps the Yesterday lane **read-only, hard**
 * (`screens.md` § The Yesterday lane). Switching on the axis inside this module
 * to draw a `button` for one lane and a `span` for the other would move that
 * guarantee from a structural fact to a conditional; as a render prop it stays
 * structural, because `YesterdayLane` has no source, no editor and no handler to
 * give a mark even if it wanted to.
 *
 * It takes no `now`. Height is `timelinePosition`'s answer and nothing else's
 * (ADR 0013).
 */
export function Lane({
  axis,
  puffSessions,
  resistedUrges,
  timeZone,
  timelineSize,
  headHeight = 0,
  renderMark,
}: {
  axis: LaneAxis
  /** This lane's Logical Day: its Puff Sessions and Resisted Urges, in any order. */
  puffSessions: readonly PuffSession[]
  resistedUrges: readonly ResistedUrge[]
  timeZone: string
  /** The room both lanes fan inside — the whole timeline's drawn box, in px. */
  timelineSize: TimelineSize
  /**
   * How far down the lane its head reaches, in px. Zero for a lane with no head
   * — which is every lane but yesterday's, and yesterday's too until its head
   * has been measured. The fan reads both the same way, because a head that
   * reaches nowhere takes no column.
   */
  headHeight?: number
  renderMark: (event: LaneEvent, style: CSSProperties) => ReactNode
}) {
  const events = useMemo(
    () => laneEvents(puffSessions, resistedUrges, timeZone),
    [puffSessions, resistedUrges, timeZone],
  )

  const fan = useMemo(
    () =>
      fanOffsets(events, {
        height: timelineSize.height,
        width: axis.roomFor(timelineSize.width),
        head: headHeight,
      }),
    [axis, events, headHeight, timelineSize],
  )

  return (
    <>
      {events.map((event, index) => {
        const offset = fan[index]!
        return (
          <Fragment key={event.key}>
            {offset > 0 ? (
              <span
                className={axis.spokeClass}
                aria-hidden="true"
                style={{ top: `${event.top}%`, width: `${offset}px` }}
              />
            ) : null}
            {renderMark(event, markPlacement(event, offset, axis))}
          </Fragment>
        )
      })}
    </>
  )
}
