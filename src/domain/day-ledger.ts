import type {
  ClearDay,
  LogicalDayKey,
  PuffSession,
  RatchetStep,
  ResistedUrge,
} from '../store/records.ts'
import { shiftLogicalDay } from './logical-day.ts'
import { stepLog, type StepLog } from './step-log.ts'

export interface DayLedgerRecord {
  puffSessions: readonly PuffSession[]
  resistedUrges: readonly ResistedUrge[]
  clearDays: readonly ClearDay[]
  ratchetSteps: readonly RatchetStep[]
}

/**
 * The record, indexed by Logical Day — built once per record and read by every
 * question below.
 *
 * The three questions the domain asks most are *is this day Known*, *what was
 * its total*, and *what Target was in force* — and each of them used to walk
 * the whole record to answer about one day. That is affordable once and
 * quadratic in a loop, and the domain loops constantly: `momentum` asks all
 * three of every Known day, `windowSatisfied` asks them of seven days per
 * Ratchet evaluation, and Stats' trend asks them of twenty-eight. At two years
 * of use `momentum` alone was walking several thousand events a few hundred
 * times over.
 *
 * A record is **immutable** — every write produces a fresh one and nothing
 * edits one in place — so the index cannot go stale, and a `WeakMap` keyed on
 * the record itself lets the old index fall away with the record it described.
 * That is why this is a cache rather than a field: a record is a plain value
 * read straight out of the store and off a Backup file, and giving it a
 * constructor to go through would put an ordering constraint on every caller
 * that assembles one.
 *
 * The sets and maps handed out are read-only, which is what keeps the sharing
 * safe: a caller that could mutate one would be editing every later answer.
 */
interface DayLedgerIndex {
  knownDays: ReadonlySet<LogicalDayKey>
  totals: ReadonlyMap<LogicalDayKey, number>
  steps: StepLog
}

const indexes = new WeakMap<DayLedgerRecord, DayLedgerIndex>()

function indexOf(record: DayLedgerRecord): DayLedgerIndex {
  let index = indexes.get(record)
  if (index === undefined) {
    const totals = new Map<LogicalDayKey, number>()
    const knownDays = new Set<LogicalDayKey>()
    for (const session of record.puffSessions) {
      knownDays.add(session.logicalDay)
      totals.set(session.logicalDay, (totals.get(session.logicalDay) ?? 0) + session.count)
    }
    for (const urge of record.resistedUrges) knownDays.add(urge.logicalDay)
    for (const day of record.clearDays) knownDays.add(day.logicalDay)
    index = { knownDays, totals, steps: stepLog(record.ratchetSteps) }
    indexes.set(record, index)
  }
  return index
}

export function dayTotal(record: DayLedgerRecord, logicalDay: LogicalDayKey): number {
  return indexOf(record).totals.get(logicalDay) ?? 0
}

export function knownLogicalDayKeys(record: DayLedgerRecord): ReadonlySet<LogicalDayKey> {
  return indexOf(record).knownDays
}

export function isKnown(record: DayLedgerRecord, logicalDay: LogicalDayKey): boolean {
  return indexOf(record).knownDays.has(logicalDay)
}

export function isCompleted(logicalDay: LogicalDayKey, today: LogicalDayKey): boolean {
  return logicalDay < today
}

export function completedDays(count: number, today: LogicalDayKey): LogicalDayKey[] {
  return Array.from({ length: count }, (_, index) => shiftLogicalDay(today, index - count))
}

export function baselineDays(
  record: DayLedgerRecord,
  today: LogicalDayKey,
): LogicalDayKey[] | undefined {
  const days = [...knownLogicalDayKeys(record)]
    .filter((day) => isCompleted(day, today))
    .sort()
    .slice(0, 7)
  return days.length === 7 ? days : undefined
}

export function baselineAverage(
  record: DayLedgerRecord,
  today: LogicalDayKey,
): number | undefined {
  const days = baselineDays(record, today)
  if (!days) return undefined
  return days.reduce((total, day) => total + dayTotal(record, day), 0) / days.length
}

/** The Target in force on a Logical Day, for callers that hold a whole record. */
export function targetOn(record: DayLedgerRecord, logicalDay: LogicalDayKey): number | undefined {
  return indexOf(record).steps.targetOn(logicalDay)
}

export function isMet(
  record: DayLedgerRecord,
  logicalDay: LogicalDayKey,
  today: LogicalDayKey,
): boolean {
  if (!isCompleted(logicalDay, today) || !isKnown(record, logicalDay)) return false
  const target = targetOn(record, logicalDay)
  return target !== undefined && dayTotal(record, logicalDay) <= target
}
