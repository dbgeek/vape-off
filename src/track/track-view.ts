import {
  completedDays,
  dayTotal,
  isKnown,
  targetOn,
  type DayLedgerRecord,
} from '../domain/day-ledger.ts'
import { logicalDayKeyOf } from '../domain/logical-day.ts'
import { isMergeWindowOpen } from '../domain/merge-window.ts'
import { pace } from '../domain/readouts.ts'
import { windowSatisfied } from '../domain/ratchet.ts'
import type { Instant, LogicalDayKey, PuffSession, ResistedUrge } from '../store/records.ts'

const CATCH_UP_WINDOW_DAYS = 7

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
  pastTargetSessionIds: ReadonlySet<string>
  /** The Puff Session another tap would still merge into. */
  openSession: PuffSession | undefined
  /** The Pace slots still ahead of now. */
  paceSlots: readonly Instant[]
  /** The Unknown Logical Days the catch-up strip offers. */
  catchUpDays: readonly LogicalDayKey[]
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
  const fromEvents = [
    ...record.puffSessions.map((session) => session.logicalDay),
    ...record.resistedUrges.map((urge) => urge.logicalDay),
    ...record.clearDays.map((day) => day.logicalDay),
  ].sort()[0]
  if (fromEvents !== undefined) return fromEvents
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

function pastTargetSessionIds(
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

function handoverAvailable(
  record: DayLedgerRecord,
  target: number | undefined,
  today: LogicalDayKey,
): boolean {
  if (target !== 1) return false
  const latestStep = record.ratchetSteps.reduce<(typeof record.ratchetSteps)[number] | undefined>(
    (latest, step) =>
      latest === undefined || step.effectiveFrom > latest.effectiveFrom ? step : latest,
    undefined,
  )
  return latestStep !== undefined && windowSatisfied(record, latestStep, today)
}

/** Everything the Track screen reads, derived from the record alone. */
export function buildTrackView(
  record: DayLedgerRecord,
  now: Date,
  timeZone: string,
): TrackView {
  const today = logicalDayKeyOf(now, timeZone)
  const puffSessions = record.puffSessions
    .filter((session) => session.logicalDay === today)
    .sort((left, right) => Date.parse(left.at) - Date.parse(right.at))
  const target = targetOn(record, today)
  const reached = targetReachedBy(puffSessions, target)

  return {
    today,
    puffSessions,
    resistedUrges: record.resistedUrges.filter((urge) => urge.logicalDay === today),
    total: dayTotal(record, today),
    target,
    targetReached: reached,
    pastTargetSessionIds: pastTargetSessionIds(puffSessions, target, reached),
    openSession: [...puffSessions]
      .reverse()
      .find((session) => isMergeWindowOpen(session.lastTapAt, now)),
    paceSlots:
      pace(record, now, timeZone)?.slots.filter((slot) => Date.parse(slot) > now.getTime()) ?? [],
    catchUpDays: catchUpDays(record, today),
    todayIsClear: record.clearDays.some((day) => day.logicalDay === today),
    handoverAvailable: handoverAvailable(record, target, today),
    hasHistory: hasHistory(record),
  }
}
