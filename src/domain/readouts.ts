import type { LogicalDayKey } from '../store/records.ts'
import {
  dayTotal,
  isMet,
  knownLogicalDayKeys,
  targetOn,
  type DayLedgerRecord,
} from './day-ledger.ts'
import {
  daysBetween,
  instantAtWallClock,
  intervalIsKnown,
  logicalDayKeyOf,
  shiftLogicalDay,
  wallClockAt,
} from './logical-day.ts'
import { FIRST_TARGET_SHARE, nextEarnedTarget } from './ratchet.ts'
import { stepLog } from './step-log.ts'

/**
 * The Dial's window, owned here because two readings share it.
 *
 * The Dial draws it and `Kicks Marked` counts across it, and §12a states the
 * figure's window as *the same window as the Dial* rather than as its own 14 —
 * so one definition, read by both, is what makes "matches exactly and moves
 * with it" structural instead of a coincidence maintained by hand. The view
 * imports it rather than declaring it, which is why the constant sits in the
 * domain despite naming a picture.
 */
export const DIAL_WINDOW_DAYS = 14

const PACE_WINDOW_OPEN_HOUR = 7
const PACE_WINDOW_CLOSE_HOUR = 23
const MIN_PACE_INTERVAL_MS = 10 * 60 * 1000

export interface PaceReading {
  intervalMs: number
  nextDue: string
  slots: string[]
}

/** Spacing: Pace counted in sittings, and how many puffs the next one holds. */
export interface SpacingReading extends PaceReading {
  puffs: number
}

export type StepsRemaining =
  | { status: 'absent' | 'retired' }
  | { status: 'available'; value: number }

export type QuitHorizon =
  | { status: 'absent' | 'retired' | 'withdrawn' }
  | { status: 'available'; precision: 'months' | 'weeks'; value: number }
  | { status: 'available'; precision: 'date'; value: LogicalDayKey }

function round(value: number): number {
  return Math.floor(value + 0.5)
}

function earnedSteps(record: DayLedgerRecord) {
  return record.ratchetSteps
    .filter((step) => step.kind === 'earned')
    .sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom))
}

/**
 * Whether a Logical Day falls in the window the Dial draws: fourteen
 * calendar-consecutive keys ending at `today`, **today's running day
 * included**. Keys sort as they read, so the comparison is the containment.
 *
 * The day under test comes first and `today` last, as in `isMet` — two keys of
 * the same type are told apart by position and nothing else, so the order is
 * worth keeping the one the rest of the domain already uses.
 */
export function isInDialWindow(logicalDay: LogicalDayKey, today: LogicalDayKey): boolean {
  return logicalDay >= shiftLogicalDay(today, -(DIAL_WINDOW_DAYS - 1)) && logicalDay <= today
}

/**
 * Kicks Marked: how many Puff Sessions across the Dial's window you marked as
 * having delivered (rules.md §12a).
 *
 * A count of **marks**, not of Kicks — an unmarked sitting means you didn't
 * say — so the figure is a floor, understated by every Kick you had and never
 * recorded and understated in the same direction always. The participle carries
 * that admission and the screen never says it again.
 *
 * Three things this deliberately does not do. It never **divides**: the
 * denominator a rate would need is *sessions you answered about*, and no
 * control exists to produce one (ADR 0015), so the app never says what fraction
 * of vaping delivers. It never **disqualifies**: §2 makes a day carrying any
 * Puff Session Known, so every session this reaches already sits in a Known
 * day, and the Unknown-day exclusion `longestGap` needs is vacuous here rather
 * than omitted. And it reads **no mechanism** — no `Target`, `Met`, `Momentum`,
 * `Ratchet` or `Pace` — which is what makes its window uniform across the
 * conversion and leaves nothing observable to happen on the day the Baseline
 * closes.
 *
 * `undefined` is the reading's absence, on the `Quit Horizon` pattern: *at
 * least 0 of your sittings delivered* is content-free and reads as a reproach.
 * The tile degrades by going absent and in no other way — a footnote here would
 * fire constantly and teach the reader that a small number is a damaged one.
 */
export function kicksMarked(
  record: DayLedgerRecord,
  today: LogicalDayKey,
): number | undefined {
  const marked = record.puffSessions.filter(
    (session) =>
      session.kickMarkedAt !== undefined && isInDialWindow(session.logicalDay, today),
  ).length
  return marked === 0 ? undefined : marked
}

export function momentum(record: DayLedgerRecord, today: LogicalDayKey): number {
  const knownDays = knownLogicalDayKeys(record)

  let score = 0
  for (const logicalDay of [...knownDays].filter((day) => day < today).sort()) {
    if (targetOn(record, logicalDay) === undefined) continue
    score = isMet(record, logicalDay, today) ? score + 1 : Math.max(0, score - 1)
  }
  return score
}

/**
 * What Pace and Spacing both read off today: the Target still to spread, the
 * Pace Window's close, and the anchor the spreading starts from — or
 * `undefined` for the silences the two share (rules.md §8, §8a).
 */
interface PaceDay {
  today: LogicalDayKey
  target: number
  remaining: number
  closeMs: number
  anchorMs: number
}

function paceDay(record: DayLedgerRecord, now: Date, timeZone: string): PaceDay | undefined {
  const wall = wallClockAt(now, timeZone)
  const minutesSinceMidnight = wall.hour * 60 + wall.minute
  if (
    minutesSinceMidnight < PACE_WINDOW_OPEN_HOUR * 60 ||
    minutesSinceMidnight >= PACE_WINDOW_CLOSE_HOUR * 60
  ) {
    return undefined
  }

  const today = logicalDayKeyOf(now, timeZone)
  const target = targetOn(record, today)
  if (target === undefined) return undefined
  const remaining = target - dayTotal(record, today)
  if (remaining <= 0) return undefined

  const localDate = { year: wall.year, month: wall.month, day: wall.day }
  const open = instantAtWallClock({ ...localDate, hour: PACE_WINDOW_OPEN_HOUR }, timeZone)
  const close = instantAtWallClock({ ...localDate, hour: PACE_WINDOW_CLOSE_HOUR }, timeZone)
  const latestSessionAt = record.puffSessions
    .filter((session) => session.logicalDay === today)
    .reduce((latest, session) => Math.max(latest, new Date(session.at).getTime()), -Infinity)

  return {
    today,
    target,
    remaining,
    closeMs: close.getTime(),
    anchorMs: Math.max(open.getTime(), latestSessionAt),
  }
}

/** The rest of the Pace Window cut into `count` slots from the anchor, or silence under ten minutes. */
function spread(day: PaceDay, now: Date, count: number): PaceReading | undefined {
  const intervalMs = (day.closeMs - now.getTime()) / count
  if (intervalMs < MIN_PACE_INTERVAL_MS) return undefined
  const slots = Array.from({ length: count }, (_, index) =>
    new Date(day.anchorMs + (index + 1) * intervalMs).toISOString(),
  )
  return { intervalMs, nextDue: slots[0]!, slots }
}

export function pace(
  record: DayLedgerRecord,
  now: Date,
  timeZone: string,
): PaceReading | undefined {
  const day = paceDay(record, now, timeZone)
  return day === undefined ? undefined : spread(day, now, day.remaining)
}

/**
 * Your habit: the lower median count of the Puff Sessions in the Dial's
 * window, today's running day included (rules.md §8a). Undefined when the
 * window holds none, there being no sitting to scale.
 */
function habit(record: DayLedgerRecord, today: LogicalDayKey): number | undefined {
  const counts = record.puffSessions
    .filter((session) => isInDialWindow(session.logicalDay, today))
    .map((session) => session.count)
    .sort((left, right) => left - right)
  return counts.length === 0 ? undefined : counts[Math.floor((counts.length - 1) / 2)]
}

/**
 * Spacing: Pace counted in sittings (rules.md §8a, ADR 0018).
 *
 * The size of a sitting is your habit scaled by how far the Target has come
 * down from the Baseline Average **as the first Step froze it** — never
 * `baselineAverage()`, which a backfill into the Baseline moves and seven Clear
 * Days make 0. `habit × target ÷ (first ÷ 0.9)` is computed as
 * `habit × target × 0.9 ÷ first`: the same ratio, but dividing by a recovered
 * origin lands a hair under a whole number often enough to floor a size away.
 *
 * Floor and ceil are bounds: the size never exceeds the Ratchet's own
 * proportion, and the day's last, smaller sitting is still counted. A reading
 * and nothing more — it reads the Target and the first Step, and nothing reads
 * it. Whether it is printed inside an open Merge Window is the screen's call.
 */
export function spacing(
  record: DayLedgerRecord,
  now: Date,
  timeZone: string,
): SpacingReading | undefined {
  const day = paceDay(record, now, timeZone)
  if (day === undefined) return undefined
  const sitting = habit(record, day.today)
  const first = stepLog(record.ratchetSteps).first()
  if (sitting === undefined || first === undefined) return undefined

  const size = Math.max(1, Math.floor((sitting * day.target * FIRST_TARGET_SHARE) / first.target))
  const reading = spread(day, now, Math.ceil(day.remaining / size))
  return reading === undefined ? undefined : { ...reading, puffs: Math.min(size, day.remaining) }
}

export function stepsRemaining(
  record: DayLedgerRecord,
  today: LogicalDayKey,
): StepsRemaining {
  let target = targetOn(record, today)
  if (target === undefined) return { status: 'absent' }
  if (target === 0) return { status: 'retired' }

  let steps = 1 // the Declared handover from Target 1 to Target 0
  while (target > 1) {
    target = nextEarnedTarget(target)
    steps += 1
  }
  return { status: 'available', value: steps }
}

export function stepCadence(record: DayLedgerRecord): number | undefined {
  const earned = earnedSteps(record)
  if (earned.length < 2) return undefined
  return daysBetween(earned[0]!.effectiveFrom, earned.at(-1)!.effectiveFrom) / (earned.length - 1)
}

export function quitHorizon(
  record: DayLedgerRecord,
  today: LogicalDayKey,
): QuitHorizon {
  const target = targetOn(record, today)
  if (target === undefined) return { status: 'absent' }
  if (target === 0) return { status: 'retired' }

  const cadence = stepCadence(record)
  if (cadence === undefined) return { status: 'absent' }
  const latestEarnedStep = earnedSteps(record).at(-1)!
  if (daysBetween(latestEarnedStep.effectiveFrom, today) > 2 * cadence) {
    return { status: 'withdrawn' }
  }

  const remaining = stepsRemaining(record, today)
  if (remaining.status !== 'available') return remaining
  const days = remaining.value * cadence
  if (days > 84) return { status: 'available', precision: 'months', value: round(days / 30.44) }
  if (days >= 14) return { status: 'available', precision: 'weeks', value: round(days / 7) }
  return {
    status: 'available',
    precision: 'date',
    value: shiftLogicalDay(today, round(days)),
  }
}

/**
 * The Longest Gap, and the admission that goes with it.
 *
 * One walk of the record answers both: a stretch lying wholly within Known
 * Logical Days is eligible, and one that is not is excluded — and if the
 * longest thing excluded beats the figure, the reading is a floor rather than a
 * measure and has to say so. A stretch of negative length is evidence of
 * nothing either way: travelling east can stamp a Puff Session ahead of the
 * clock (ADR 0008), and neither half of the reading should count it.
 */
export interface LongestGap {
  /** The longest eligible stretch, or undefined when none is. */
  milliseconds: number | undefined
  /** Whether a longer stretch was excluded for crossing an Unknown Logical Day. */
  disqualifiedByUnknownDay: boolean
}

export function longestGap(
  record: DayLedgerRecord,
  now: Date,
  today: LogicalDayKey,
): LongestGap {
  const sessions = [...record.puffSessions].sort(
    (left, right) => Date.parse(left.at) - Date.parse(right.at),
  )
  if (sessions.length === 0) {
    return { milliseconds: undefined, disqualifiedByUnknownDay: false }
  }

  const knownDays = knownLogicalDayKeys(record)
  let best: number | undefined
  let longestExcluded: number | undefined

  function consider(
    fromAt: number,
    fromDay: LogicalDayKey,
    toAt: number,
    toDay: LogicalDayKey,
  ): void {
    const stretch = toAt - fromAt
    if (stretch < 0) return
    if (intervalIsKnown(knownDays, fromDay, toDay)) {
      best = Math.max(best ?? 0, stretch)
    } else {
      longestExcluded = Math.max(longestExcluded ?? 0, stretch)
    }
  }

  for (let index = 1; index < sessions.length; index += 1) {
    const previous = sessions[index - 1]!
    const current = sessions[index]!
    consider(
      Date.parse(previous.at),
      previous.logicalDay,
      Date.parse(current.at),
      current.logicalDay,
    )
  }

  // The still-running stretch is the Current Gap. When that is ineligible, the
  // stretch it would have been is still weighed as an exclusion — unless it is
  // negative, which `consider` already treats as evidence of nothing.
  const running = currentGap(record, now, today)
  if (running !== undefined) {
    best = Math.max(best ?? 0, running)
  } else {
    const latest = sessions.at(-1)!
    consider(Date.parse(latest.at), latest.logicalDay, now.getTime(), today)
  }

  return {
    milliseconds: best,
    disqualifiedByUnknownDay:
      longestExcluded !== undefined && longestExcluded > (best ?? -Infinity),
  }
}

/**
 * The Current Gap: the Longest Gap's still-running stretch, read on its own.
 *
 * Measured from the latest Puff Session's `at`, as §12 measures every stretch,
 * so the two readings are one quantity rather than two that almost agree.
 */
export function currentGap(
  record: DayLedgerRecord,
  now: Date,
  today: LogicalDayKey,
): number | undefined {
  const latest = [...record.puffSessions].sort(
    (left, right) => Date.parse(left.at) - Date.parse(right.at),
  ).at(-1)
  if (latest === undefined || latest.logicalDay > today) return undefined
  // The Logical Day still running is not yet judged, so only the completed ones
  // the stretch crosses must be Known. A session logged today crosses none —
  // an empty range `intervalIsKnown` would answer `false`, so it is answered here.
  if (
    latest.logicalDay < today &&
    !intervalIsKnown(knownLogicalDayKeys(record), latest.logicalDay, shiftLogicalDay(today, -1))
  ) {
    return undefined
  }
  const stretch = now.getTime() - Date.parse(latest.at)
  return stretch < 0 ? undefined : stretch
}
