import { logicalMinuteOf } from '../domain/logical-day.ts'
import type { Instant } from '../store/records.ts'

/**
 * Where the Track timeline draws things: the height an event hangs at, and how
 * big a Puff Session's mark and a Resisted Urge's ring are drawn. Geometry only
 * — it reads the clock and a count, never the record.
 */

const MINUTES_PER_DAY = 24 * 60

/**
 * Where each lane's spine stands, as a percentage of the timeline's width
 * (`screens.md` § The two lanes).
 *
 * Here rather than in the stylesheet because two things need the same numbers
 * and only one of them is CSS: `index.css` draws each axis and hangs every mark
 * on it through `--spine` and `--yesterday-spine`, which `TrackScreen` sets from
 * these constants, and the fan needs them to know how much room each lane has to
 * fan into. A second copy of either number is a lane that silently fans into the
 * wrong width.
 *
 * Yesterday sits left of today and both lanes fan right, so the reading
 * direction never changes and yesterday fans into the gap between the two.
 */
export const YESTERDAY_LANE_SPINE = 16

/** @see YESTERDAY_LANE_SPINE */
export const LIVE_LANE_SPINE = 46

/**
 * How much room the Yesterday lane has to fan into, in px, on a timeline this
 * wide.
 *
 * The gap between the two spines, and no wider: yesterday fans right, so its
 * budget runs out exactly where the live lane's spine stands. Derived from the
 * two constants rather than written down as its own ~30% for the same reason the
 * spines are constants — a third number is a third thing that can disagree.
 */
export function yesterdayLaneWidth(timelineWidth: number): number {
  return timelineWidth * ((LIVE_LANE_SPINE - YESTERDAY_LANE_SPINE) / 100)
}

/**
 * How much room the live lane has to fan into, in px, on a timeline this wide.
 *
 * The lane owns everything right of its spine — nothing is drawn beyond it — so
 * this is the whole of its fan's budget.
 */
export function liveLaneWidth(timelineWidth: number): number {
  return timelineWidth * (1 - LIVE_LANE_SPINE / 100)
}

/**
 * The custom properties `index.css` hangs each lane's contents on.
 *
 * Named here, beside the numbers they carry, because they are the same fact
 * wearing a different hat: `TrackScreen` sets both properties from both
 * constants above, and every fanned mark writes its column as an offset from one
 * of them. A property name spelled out at a call site is one more place the two
 * spines can drift apart, which is the thing this module exists to prevent.
 */
export const LIVE_SPINE_VARIABLE = '--spine'
export const YESTERDAY_SPINE_VARIABLE = '--yesterday-spine'

/** One lane's spine, named as the stylesheet knows it. */
export type SpineVariable = typeof LIVE_SPINE_VARIABLE | typeof YESTERDAY_SPINE_VARIABLE

/**
 * The timeline's drawn box in px — what turns a height on the axis into a
 * distance, and so what makes a collision decidable at all.
 *
 * Deliberately not `timeline-fan.ts`'s `FanBudget`, which carries the same two
 * field names meaning something else: a budget's width is the room one lane has
 * to fan into, this width is the whole timeline's. Sharing the type would let
 * one be passed where the other is meant — which is why the two are named for
 * what they are rather than told apart by this paragraph.
 */
export interface TimelineSize {
  width: number
  height: number
}

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
