import { logicalMinuteOf } from '../domain/logical-day.ts'
import type { Instant } from '../store/records.ts'

/**
 * Where the Track timeline draws things: the height an event hangs at, and how
 * big a Puff Session's mark and a Resisted Urge's ring are drawn. Geometry only
 * — it reads the clock and a count, never the record.
 */

const MINUTES_PER_DAY = 24 * 60

/**
 * The height, as a percentage of the timeline, that an event hangs at.
 *
 * One fixed mapping over the Logical Day: 04:00 at the top, 04:00 at the
 * bottom, linear (`screens.md` § The axis). The same scale all day and the same
 * scale every day, so equal distance is equal time on any two days.
 *
 * **It takes no `now`, and it must never take one again.** A position that
 * consults the clock's current reading — or the record — rescales the day as it
 * is lived, which is the whole of ADR 0013 and one line to undo. `now` is a line
 * drawn on this axis; it divides nothing and sizes nothing.
 */
export function timelinePosition(at: Date | Instant, timeZone: string): number {
  return (logicalMinuteOf(at, timeZone) / MINUTES_PER_DAY) * 100
}

/**
 * The size, in pixels, of the tier a Puff Session opens in — the one every
 * session falls back to when it clears none of the steps above.
 */
const SMALLEST_MARK = 20

/**
 * The steps a Puff Session's mark climbs above `SMALLEST_MARK`, largest first
 * (`screens.md` § Marks, rings and slots). Each entry is the count at which
 * that tier opens, so 3 puffs step to 28px and 2 stay at the smallest.
 */
const MARK_TIERS: ReadonlyArray<{ from: number; size: number }> = [
  { from: 11, size: 44 },
  { from: 6, size: 36 },
  { from: 3, size: 28 },
]

/**
 * The width and height, in pixels, of the mark a Puff Session is drawn as.
 *
 * **A function of that one session's `count` and nothing else** — never the
 * day's total and never the day's largest, so a session draws the same size on
 * a quiet day as on a heavy one and improving cannot inflate your own marks.
 *
 * Stepped rather than continuous on purpose. Size is the redundant at-a-glance
 * channel and the numeral printed inside is the exact value, so every tier has
 * to be above the legible floor by construction — which is what disqualifies a
 * faithful `sqrt(count)` area encoding rather than merely making it expensive:
 * it draws a one-puff session as an 8px fleck and evicts the numeral.
 */
export function markSize(count: number): number {
  return MARK_TIERS.find((tier) => count >= tier.from)?.size ?? SMALLEST_MARK
}

/**
 * The diameter, in pixels, of a Resisted Urge's ring.
 *
 * Fixed: it carries no count, so it has no sizing rule to obey. Kept in pixels
 * beside the mark tiers rather than in the stylesheet because the two are read
 * against each other — under the smallest 20px mark the ring reads as a
 * different kind of thing by shape as well as size, and a ring sized in `rem`
 * would outgrow that mark whenever the reader scales their text up.
 */
export const RESISTED_URGE_RING_SIZE = 14
