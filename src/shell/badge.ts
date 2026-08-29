import { dayTotal, targetOn, type DayLedgerRecord } from '../domain/day-ledger.ts'
import { logicalDayKeyOf } from '../store/logical-day.ts'

export interface BadgeController {
  setAppBadge?: (contents?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

export async function updateBadge(
  record: DayLedgerRecord,
  now: Date,
  timeZone: string,
  badge: BadgeController = navigator,
): Promise<void> {
  const today = logicalDayKeyOf(now, timeZone)
  const target = targetOn(record, today)
  if (target === undefined || target === 0) {
    await badge.clearAppBadge?.()
    return
  }

  await badge.setAppBadge?.(Math.max(0, target - dayTotal(record, today)))
}
