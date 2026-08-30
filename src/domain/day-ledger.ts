import type {
  ClearDay,
  LogicalDayKey,
  PuffSession,
  RatchetStep,
  ResistedUrge,
} from '../store/records.ts'
import { shiftLogicalDay } from './logical-day.ts'
import { stepLog } from './step-log.ts'

export interface DayLedgerRecord {
  puffSessions: readonly PuffSession[]
  resistedUrges: readonly ResistedUrge[]
  clearDays: readonly ClearDay[]
  ratchetSteps: readonly RatchetStep[]
}

export function dayTotal(record: DayLedgerRecord, logicalDay: LogicalDayKey): number {
  return record.puffSessions
    .filter((session) => session.logicalDay === logicalDay)
    .reduce((total, session) => total + session.count, 0)
}

export function knownLogicalDayKeys(record: DayLedgerRecord): Set<LogicalDayKey> {
  return new Set([
    ...record.puffSessions.map((session) => session.logicalDay),
    ...record.resistedUrges.map((urge) => urge.logicalDay),
    ...record.clearDays.map((day) => day.logicalDay),
  ])
}

export function isKnown(record: DayLedgerRecord, logicalDay: LogicalDayKey): boolean {
  return knownLogicalDayKeys(record).has(logicalDay)
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
  return stepLog(record.ratchetSteps).targetOn(logicalDay)
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
