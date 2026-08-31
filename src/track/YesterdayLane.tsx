import { Fragment, useMemo } from 'react'
import { laneEvents, puffLabel, urgeLabel } from './lane-events.ts'
import { fanOffsets } from './timeline-fan.ts'
import { yesterdayLaneWidth } from './timeline-geometry.ts'
import type { YesterdayView } from './track-view.ts'

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
  timelineSize: { width: number; height: number }
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
        const mark = {
          top: `${event.top}%`,
          left:
            offset === 0 ? undefined : `calc(var(--yesterday-spine) + ${offset}px)`,
          width: `${event.size}px`,
          height: `${event.size}px`,
        }
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
                aria-label={puffLabel(event.session, timeZone)}
              >
                {event.session.count}
              </span>
            ) : (
              <span
                className="yesterday-ring"
                role="img"
                style={mark}
                aria-label={urgeLabel(event.urge, timeZone)}
              />
            )}
          </Fragment>
        )
      })}
    </div>
  )
}
