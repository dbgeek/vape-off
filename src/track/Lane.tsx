/**
 * A lane of the Track timeline: where its spine stands, how much room it has to
 * fan into, and the custom property `index.css` hangs its contents on
 * (`screens.md` § The two lanes).
 *
 * There are exactly two, and the spec means it — a lane whose identity depended
 * on where your gaps are "would put a third Logical Day on Track in all but
 * name". `LaneAxis` is a type rather than a closed union anyway, because the
 * point is not to make a third lane impossible to write; it is to make the three
 * facts about one lane impossible to pull apart.
 */

/**
 * One lane's axis: the three facts that must never be paired with each other's.
 *
 * They travel as one value because separately they are three chances to get the
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

/** One lane's spine, named as the stylesheet knows it. */
export type SpineVariable = '--spine' | '--yesterday-spine'

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
  roomFor: (timelineWidth) => timelineWidth * (1 - LIVE_SPINE / 100),
}

/**
 * Both lanes, for the one caller that needs them together: `TrackScreen` sets
 * every spine property on the timeline in one pass, so adding a lane cannot
 * leave its custom property undeclared.
 */
export const LANE_AXES: readonly LaneAxis[] = [YESTERDAY_LANE, LIVE_LANE]
