import {
  completedDays,
  dayTotal,
  isKnown,
  knownLogicalDayKeys,
  targetOn,
  type DayLedgerRecord,
} from '../domain/day-ledger.ts'
import { logicalDayKeyOf, shiftLogicalDay } from '../domain/logical-day.ts'
import { openSessionAt } from '../domain/merge-window.ts'
import { pace } from '../domain/readouts.ts'
import { decideStep } from '../domain/ratchet.ts'
import type { Instant, LogicalDayKey, PuffSession, ResistedUrge } from '../store/records.ts'

const CATCH_UP_WINDOW_DAYS = 7

/**
 * A Known previous Logical Day, as the Yesterday lane draws it (`screens.md`
 * § The four states of yesterday).
 *
 * The whole day, never trimmed to `now`: the lane is drawn full height because
 * all of yesterday happened, and a day still being compared must not draw
 * identically to one that genuinely ended early.
 */
export interface YesterdayView {
  logicalDay: LogicalDayKey
  /** Yesterday's Puff Sessions, earliest first. */
  puffSessions: readonly PuffSession[]
  /**
   * Yesterday's Resisted Urges, which the lane draws for honesty rather than
   * completeness: a day Known only by these has no Puff Sessions, so dropping
   * them would draw a day that was fought identically to a Clear Day.
   */
  resistedUrges: readonly ResistedUrge[]
  /** Whether yesterday was declared a Clear Day. */
  isClear: boolean
}

export interface TrackView {
  today: LogicalDayKey
  /** Today's Puff Sessions, earliest first. */
  puffSessions: readonly PuffSession[]
  resistedUrges: readonly ResistedUrge[]
  total: number
  target: number | undefined
  /** The Puff Session that took the day to its Target, if one has. */
  targetReached: PuffSession | undefined
  /** Today's Puff Sessions that sit past the Target. */
  overTargetSessionIds: ReadonlySet<string>
  /** The Puff Session another tap would still merge into. */
  openSession: PuffSession | undefined
  /** The Pace slots still ahead of now. */
  paceSlots: readonly Instant[]
  /** The Unknown Logical Days the catch-up strip offers. */
  catchUpDays: readonly LogicalDayKey[]
  /** The previous Logical Day, or `undefined` when it is Unknown. */
  yesterday: YesterdayView | undefined
  todayIsClear: boolean
  /** Whether the Declared Step out of Target 1 has been earned. */
  handoverAvailable: boolean
  hasHistory: boolean
}

function hasHistory(record: DayLedgerRecord): boolean {
  return (
    record.puffSessions.length > 0 ||
    record.resistedUrges.length > 0 ||
    record.clearDays.length > 0 ||
    record.ratchetSteps.length > 0
  )
}

/**
 * The earliest Logical Day the record has evidence about. Events answer it
 * directly; a record whose events were hard-deleted still has the Ratchet's own
 * decisions, and the day a Step took effect is evidence the app was in use.
 */
function earliestEvidenceDay(record: DayLedgerRecord): LogicalDayKey | undefined {
  const earliestKnownDay = [...knownLogicalDayKeys(record)].sort()[0]
  if (earliestKnownDay !== undefined) return earliestKnownDay
  return [...record.ratchetSteps].sort((left, right) =>
    left.effectiveFrom.localeCompare(right.effectiveFrom),
  )[0]?.effectiveFrom
}

function catchUpDays(record: DayLedgerRecord, today: LogicalDayKey): LogicalDayKey[] {
  const earliest = earliestEvidenceDay(record)
  if (earliest === undefined) return []
  return completedDays(CATCH_UP_WINDOW_DAYS, today).filter(
    (logicalDay) => logicalDay >= earliest && !isKnown(record, logicalDay),
  )
}

/** A Logical Day's Puff Sessions, earliest first. */
function sessionsOn(
  record: DayLedgerRecord,
  logicalDay: LogicalDayKey,
): readonly PuffSession[] {
  return record.puffSessions
    .filter((session) => session.logicalDay === logicalDay)
    .sort((left, right) => Date.parse(left.at) - Date.parse(right.at))
}

/**
 * The previous Logical Day, or `undefined` when it is Unknown.
 *
 * **Always the day before today, never the most recent Known one.** A lane whose
 * identity depended on where the gaps are would change the comparison silently
 * underneath the reader.
 *
 * One `undefined` answers both Unknown states, because the lane draws the same
 * nothing for each: it only ever asserts what the app knows, and silence is the
 * correct drawing of an absence of evidence (ADR 0001). Deliberately not derived
 * from `catchUpDays` — that list is filtered to days at or after the app's first
 * evidence, so on day one of use yesterday is Unknown and correctly offered
 * nothing, and reading the lane off the strip would draw a lane there.
 */
function yesterdayOf(
  record: DayLedgerRecord,
  today: LogicalDayKey,
): YesterdayView | undefined {
  const logicalDay = shiftLogicalDay(today, -1)
  if (!isKnown(record, logicalDay)) return undefined
  return {
    logicalDay,
    puffSessions: sessionsOn(record, logicalDay),
    resistedUrges: record.resistedUrges.filter((urge) => urge.logicalDay === logicalDay),
    isClear: record.clearDays.some((day) => day.logicalDay === logicalDay),
  }
}

/** The Puff Session whose count took the running total to the Target. */
function targetReachedBy(
  sessions: readonly PuffSession[],
  target: number | undefined,
): PuffSession | undefined {
  if (target === undefined || target === 0) return undefined
  let runningTotal = 0
  return sessions.find((session) => {
    runningTotal += session.count
    return runningTotal >= target
  })
}

function overTargetSessionIds(
  sessions: readonly PuffSession[],
  target: number | undefined,
  reached: PuffSession | undefined,
): Set<string> {
  // At Target 0 there is no allowance for a Puff Session to sit inside, so every
  // one of them is past it and none of them is the moment it was reached.
  if (target === 0) return new Set(sessions.map((session) => session.id))
  if (reached === undefined) return new Set()
  return new Set(
    sessions.slice(sessions.indexOf(reached) + 1).map((session) => session.id),
  )
}

/**
 * Whether the offer should stand — asked of the Ratchet in the same terms the
 * tap will be, so the button is never shown for a write that would be refused.
 */
function handoverAvailable(record: DayLedgerRecord, today: LogicalDayKey): boolean {
  return decideStep(record, today, 'handover').status === 'step'
}

/** Everything the Track screen reads, derived from the record alone. */
export function buildTrackView(
  record: DayLedgerRecord,
  now: Date,
  timeZone: string,
): TrackView {
  const today = logicalDayKeyOf(now, timeZone)
  const puffSessions = sessionsOn(record, today)
  const target = targetOn(record, today)
  const reached = targetReachedBy(puffSessions, target)

  return {
    today,
    puffSessions,
    resistedUrges: record.resistedUrges.filter((urge) => urge.logicalDay === today),
    total: dayTotal(record, today),
    target,
    targetReached: reached,
    overTargetSessionIds: overTargetSessionIds(puffSessions, target, reached),
    openSession: openSessionAt(record.puffSessions, now, timeZone),
    paceSlots:
      pace(record, now, timeZone)?.slots.filter((slot) => Date.parse(slot) > now.getTime()) ?? [],
    catchUpDays: catchUpDays(record, today),
    yesterday: yesterdayOf(record, today),
    todayIsClear: record.clearDays.some((day) => day.logicalDay === today),
    handoverAvailable: handoverAvailable(record, today),
    hasHistory: hasHistory(record),
  }
}
