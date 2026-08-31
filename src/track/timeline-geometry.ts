import { logicalMinuteOf } from '../domain/logical-day.ts'
import type { Instant } from '../store/records.ts'

/**
 * Where the Track timeline draws things: the height an event hangs at, and how
 * big a Puff Session's mark is drawn. Geometry only — it reads the clock and a
 * count, never the record.
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

/** The width and height, in pixels, of the mark a Puff Session is drawn as. */
export function markSize(count: number): number {
  return Math.min(44, 12 + Math.sqrt(count) * 7)
}
