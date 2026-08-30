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
import { nextEarnedTarget } from './ratchet.ts'

const PACE_WINDOW_OPEN_HOUR = 7
const PACE_WINDOW_CLOSE_HOUR = 23
const MIN_PACE_INTERVAL_MS = 10 * 60 * 1000

export interface PaceReading {
  intervalMs: number
  nextDue: string
  slots: string[]
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

export function momentum(record: DayLedgerRecord, today: LogicalDayKey): number {
  const knownDays = knownLogicalDayKeys(record)

  let score = 0
  for (const logicalDay of [...knownDays].filter((day) => day < today).sort()) {
    if (targetOn(record, logicalDay) === undefined) continue
    score = isMet(record, logicalDay, today) ? score + 1 : Math.max(0, score - 1)
  }
  return score
}

export function pace(
  record: DayLedgerRecord,
  now: Date,
  timeZone: string,
): PaceReading | undefined {
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
  const intervalMs = (close.getTime() - now.getTime()) / remaining
  if (intervalMs < MIN_PACE_INTERVAL_MS) return undefined

  const latestSessionAt = record.puffSessions
    .filter((session) => session.logicalDay === today)
    .reduce((latest, session) => Math.max(latest, new Date(session.at).getTime()), -Infinity)
  const anchor = Math.max(open.getTime(), latestSessionAt)
  const slots = Array.from({ length: remaining }, (_, index) =>
    new Date(anchor + (index + 1) * intervalMs).toISOString(),
  )

  return { intervalMs, nextDue: slots[0]!, slots }
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

  const latest = sessions.at(-1)!
  consider(Date.parse(latest.at), latest.logicalDay, now.getTime(), today)

  return {
    milliseconds: best,
    disqualifiedByUnknownDay:
      longestExcluded !== undefined && longestExcluded > (best ?? -Infinity),
  }
}
