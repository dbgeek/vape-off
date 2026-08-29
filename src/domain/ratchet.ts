import type { LogicalDayKey, RatchetStep } from '../store/records.ts'
import { completedDays, isMet, type DayLedgerRecord } from './day-ledger.ts'

export { targetOn } from './day-ledger.ts'

export function nextEarnedTarget(target: number): number {
  return target - Math.max(1, Math.floor(0.1 * target + 0.5))
}

export function windowSatisfied(
  record: DayLedgerRecord,
  step: RatchetStep,
  today: LogicalDayKey,
): boolean {
  return (
    completedDays(7, today).filter(
      (logicalDay) => logicalDay > step.effectiveFrom && isMet(record, logicalDay, today),
    ).length >= 5
  )
}
