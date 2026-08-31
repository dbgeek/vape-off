import { logicalMinuteOf } from '../domain/logical-day.ts'
import type { Instant } from '../store/records.ts'

/**
 * Where the Track timeline draws things: the height an event hangs at, and how
 * big a Puff Session's mark is drawn. Geometry only — it reads the clock and a
 * count, never the record.
 */

/**
 * The height, as a percentage of the timeline, that an event hangs at. Now sits
 * at 50% (`screens.md` § The timeline): the lived part of the Logical Day is
 * spread across the top half and the part still ahead across the bottom half.
 */
export function timelinePosition(at: Date | Instant, now: Date, timeZone: string): number {
  const eventMinute = logicalMinuteOf(at, timeZone)
  const nowMinute = logicalMinuteOf(now, timeZone)
  if (eventMinute <= nowMinute) {
    return nowMinute === 0 ? 0 : (eventMinute / nowMinute) * 50
  }
  const futureMinutes = 24 * 60 - nowMinute
  return 50 + ((eventMinute - nowMinute) / futureMinutes) * 50
}

/** The width and height, in pixels, of the mark a Puff Session is drawn as. */
export function markSize(count: number): number {
  return Math.min(44, 12 + Math.sqrt(count) * 7)
}
