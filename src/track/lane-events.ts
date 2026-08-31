import { formatWallTime } from '../domain/logical-day.ts'
import type { PuffSession, ResistedUrge } from '../store/records.ts'
import type { FannedEvent } from './timeline-fan.ts'
import { markSize, RESISTED_URGE_RING_SIZE, timelinePosition } from './timeline-geometry.ts'

/**
 * What a lane has to draw, in the shape the fan can place.
 *
 * Puff Sessions and Resisted Urges arrive in separate lists and are drawn as
 * different shapes, but they share a lane, so the fan has to place them against
 * each other — a ring landing on a mark is a collision like any other
 * (`screens.md` § When marks collide — the fan).
 *
 * Shared by both lanes rather than built twice, because *where* an event hangs
 * and *how big it is drawn* are the same two questions on either side of the
 * timeline. What the lanes disagree about is what the drawing can then do —
 * today's marks are the handle for a Correction, yesterday's are read-only —
 * and that disagreement lives in the components, not here.
 */
export type LaneEvent = FannedEvent & { key: string } & (
    | { kind: 'puff'; session: PuffSession }
    | { kind: 'urge'; urge: ResistedUrge }
  )

/** How a Puff Session's mark reads aloud. */
export function puffLabel(session: PuffSession, timeZone: string): string {
  const unit = session.count === 1 ? 'puff' : 'puffs'
  return `Puff Session, ${session.count} ${unit} at ${formatWallTime(session.at, timeZone)}`
}

/** How a Resisted Urge's ring reads aloud. */
export function urgeLabel(urge: ResistedUrge, timeZone: string): string {
  return `Resisted Urge at ${formatWallTime(urge.at, timeZone)}`
}

/**
 * One Logical Day's events, placed on the axis and sized, in time order.
 *
 * Time order rather than record order, because a lane's drawing is read top to
 * bottom and the fan colours into the leftmost free column *in time order*.
 */
export function laneEvents(
  puffSessions: readonly PuffSession[],
  resistedUrges: readonly ResistedUrge[],
  timeZone: string,
): LaneEvent[] {
  return [
    ...puffSessions.map(
      (session): LaneEvent => ({
        kind: 'puff',
        key: `puff-${session.id}`,
        session,
        top: timelinePosition(session.at, timeZone),
        size: markSize(session.count),
      }),
    ),
    ...resistedUrges.map(
      (urge): LaneEvent => ({
        kind: 'urge',
        key: `urge-${urge.id}`,
        urge,
        top: timelinePosition(urge.at, timeZone),
        size: RESISTED_URGE_RING_SIZE,
      }),
    ),
  ].sort((one, other) => one.top - other.top)
}
