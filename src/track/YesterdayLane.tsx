import { Fragment, useMemo } from 'react'
import { laneEvents, markPlacement, puffLabel, urgeLabel } from './lane-events.ts'
import { fanOffsets } from './timeline-fan.ts'
import {
  type TimelineSize,
  yesterdayLaneWidth,
  YESTERDAY_SPINE_VARIABLE,
} from './timeline-geometry.ts'
import type { YesterdayView } from './track-view.ts'

/**
 * How yesterday's marks read aloud.
 *
 * The lane's one dim word is what tells a sighted reader which day they are
 * looking at; without this an assistive technology hears two indistinguishable
 * sets of marks, because a Puff Session describes itself the same way in either
 * lane. The `one word of text` rule governs what is *drawn*, so paying for the
 * distinction here costs the timeline nothing.
 */
function inTheLane(label: string): string {
  return `Yesterday, ${label}`
}

/**
 * The Yesterday lane: the previous Logical Day drawn whole on today's exact
 * axis, dim, in its own lane (`screens.md` § The Yesterday lane).
 *
 * Equal height is equal time of day on both lanes, so the comparison is literal
 * rather than shape-against-shape — and the lane is drawn **full height,
 * always**, never trimmed to `now`. That is what makes the sparse morning
 * affordable, and truncating would both restore the empty morning and draw a day
 * still in progress identically to one that genuinely ended early.
 *
 * **Read-only, hard**, and read-only by construction rather than by discipline:
 * this module is handed a `YesterdayView` and nothing else. It has no source, no
 * editor and no Target, so there is no tap target it *could* draw, no hairline
 * it could hang and nothing it could paint red. A tappable second lane would
 * roughly double the tap targets on the one screen whose thesis is that logging
 * costs under a second, and the wrong tap there is a mis-log on *today*.
 */
export function YesterdayLane({
  yesterday,
  timeZone,
  timelineSize,
}: {
  yesterday: YesterdayView
  timeZone: string
  timelineSize: TimelineSize
}) {
  const events = useMemo(
    () => laneEvents(yesterday.puffSessions, yesterday.resistedUrges, timeZone),
    [yesterday.puffSessions, yesterday.resistedUrges, timeZone],
  )

  /**
   * Yesterday fans right, into the gap between the two spines — both lanes fan
   * the same way, so the reading direction never changes.
   */
  const fan = useMemo(
    () =>
      fanOffsets(events, {
        height: timelineSize.height,
        width: yesterdayLaneWidth(timelineSize.width),
      }),
    [events, timelineSize],
  )

  return (
    <div className="yesterday-lane">
      <div className="yesterday-axis" aria-hidden="true" />
      {/* One dim word, present if and only if the lane is — nothing else on
        * screen says the dim lane means yesterday specifically. The `Clear`
        * token sits beneath it rather than merged into `Yesterday: Clear`,
        * which would read as the value of a field; a Clear Day is a deliberate
        * assertion, and drawing the programme's most deliberate act as an empty
        * lane is the one thing this lane must not do. */}
      <div className="yesterday-head">
        <span className="yesterday-label">Yesterday</span>
        {yesterday.isClear ? <span className="yesterday-clear">Clear</span> : null}
      </div>

      {events.map((event, index) => {
        const offset = fan[index]!
        const mark = markPlacement(event, offset, YESTERDAY_SPINE_VARIABLE)
        return (
          <Fragment key={event.key}>
            {offset > 0 ? (
              <span
                className="yesterday-spoke"
                aria-hidden="true"
                style={{ top: `${event.top}%`, width: `${offset}px` }}
              />
            ) : null}
            {event.kind === 'puff' ? (
              <span
                className="yesterday-mark"
                role="img"
                style={mark}
                aria-label={inTheLane(puffLabel(event.session, timeZone))}
              >
                {event.session.count}
              </span>
            ) : (
              <span
                className="yesterday-ring"
                role="img"
                style={mark}
                aria-label={inTheLane(urgeLabel(event.urge, timeZone))}
              />
            )}
          </Fragment>
        )
      })}
    </div>
  )
}
