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

/**
 * Whether a Puff Session carries a Kick.
 *
 * Presence of `kickMarkedAt` is the mark and absence is Unknown — there is no
 * `false` to read, because the app never asks whether a sitting delivered
 * *nothing* (ADR 0015). Asked here rather than at each drawing so the two lanes
 * cannot disagree about what a Kick is — and the editor's toggle is a third
 * drawing of the same fact, so it reads it from here too rather than asking the
 * record its own way.
 */
export function isKicked(session: PuffSession): boolean {
  return session.kickMarkedAt !== undefined
}

/**
 * The modifier a Kicked mark wears, ready to append, or nothing.
 *
 * One function rather than the same conditional written once per lane, because
 * the Yesterday lane draws its Kicks in the live lane's treatment at the lane's
 * own `0.42` and gets **nothing per-mark** of its own (ADR 0014). Two literals
 * would be two chances for one lane to grow a halo the other does not have.
 */
export function kickedClass(session: PuffSession): string {
  return isKicked(session) ? ' kicked' : ''
}

/**
 * How a Puff Session's mark reads aloud.
 *
 * The Kick is drawn as a ring outside the mark, which is nothing at all to a
 * reader who cannot see it — so the label is where the Kick is *said*, in
 * either lane. It goes last: the session is what it always was, and the Kick is
 * a fact appended to it (`screens.md` § The Kicked halo).
 */
export function puffLabel(session: PuffSession, timeZone: string): string {
  const unit = session.count === 1 ? 'puff' : 'puffs'
  const at = formatWallTime(session.at, timeZone)
  return `Puff Session, ${session.count} ${unit} at ${at}${isKicked(session) ? ', Kicked' : ''}`
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
