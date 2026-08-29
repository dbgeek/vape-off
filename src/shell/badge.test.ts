import { describe, expect, it, vi } from 'vitest'
import type { DayLedgerRecord } from '../domain/day-ledger.ts'
import type { PuffSession, RatchetStep } from '../store/records.ts'
import { updateBadge } from './badge.ts'

const emptyRecord: DayLedgerRecord = {
  puffSessions: [],
  resistedUrges: [],
  clearDays: [],
  ratchetSteps: [],
}

function target(target: number): RatchetStep {
  return {
    id: 'target',
    effectiveFrom: '2026-08-20',
    target,
    kind: 'earned',
    at: '2026-08-20T04:00:00.000Z',
  }
}

function session(count: number): PuffSession {
  return {
    id: 'session',
    at: '2026-08-29T12:00:00.000Z',
    lastTapAt: '2026-08-29T12:00:00.000Z',
    count,
    logicalDay: '2026-08-29',
    tz: 'UTC',
  }
}

describe('the app badge', () => {
  it('carries the remaining Target and clears when Target is absent or zero', async () => {
    const badge = { setAppBadge: vi.fn(), clearAppBadge: vi.fn() }
    const now = new Date('2026-08-29T12:00:00.000Z')

    await updateBadge(
      { ...emptyRecord, puffSessions: [session(9)], ratchetSteps: [target(24)] },
      now,
      'UTC',
      badge,
    )
    expect(badge.setAppBadge).toHaveBeenCalledWith(15)

    await updateBadge(emptyRecord, now, 'UTC', badge)
    await updateBadge({ ...emptyRecord, ratchetSteps: [target(0)] }, now, 'UTC', badge)
    expect(badge.clearAppBadge).toHaveBeenCalledTimes(2)
  })
})
