import { describe, expect, it } from 'vitest'
import type { DayLedgerRecord } from '../domain/day-ledger.ts'
import type { ClearDay, ExportRecord, PuffSession, RatchetStep, ResistedUrge } from '../store/records.ts'
import { buildStatsView } from './stats-view.ts'

const emptyRecord: DayLedgerRecord = {
  puffSessions: [],
  resistedUrges: [],
  clearDays: [],
  ratchetSteps: [],
}

function session(id: string, logicalDay: string, at: string, count: number): PuffSession {
  return { id, logicalDay, at, lastTapAt: at, count, tz: 'UTC' }
}

function kickedSession(id: string, logicalDay: string, at: string, count = 3): PuffSession {
  return { ...session(id, logicalDay, at, count), kickMarkedAt: at }
}

function urge(id: string, logicalDay: string, at: string): ResistedUrge {
  return { id, logicalDay, at, tz: 'UTC' }
}

function clearDay(logicalDay: string): ClearDay {
  return { logicalDay, at: `${logicalDay}T12:00:00.000Z`, tz: 'UTC' }
}

function step(effectiveFrom: string, target: number): RatchetStep {
  return {
    id: `step-${effectiveFrom}`,
    effectiveFrom,
    target,
    kind: 'earned',
    at: `${effectiveFrom}T04:00:00.000Z`,
  }
}

describe('the Stats view', () => {
  it('makes a 14-Known-Day clock from pickup starts with 04:00 at the boundary and independent scales', () => {
    const record = {
      ...emptyRecord,
      puffSessions: [
        session('boundary', '2026-08-28', '2026-08-29T01:00:00.000Z', 10),
        session('morning', '2026-08-29', '2026-08-29T04:15:00.000Z', 4),
        session('too-old', '2026-08-15', '2026-08-15T04:00:00.000Z', 100),
      ],
      resistedUrges: [urge('one', '2026-08-29', '2026-08-29T04:30:00.000Z')],
    }

    const view = buildStatsView(record, [], new Date('2026-08-29T12:00:00.000Z'), 'UTC')

    expect(view.dial.windowDays).toBe(14)
    expect(view.dial.knownDays).toBe(2)
    expect(view.dial.hours[0]).toMatchObject({ hour: 4, puffs: 4, urges: 1, outward: 0.4, inward: 1 })
    expect(view.dial.hours[21]).toMatchObject({ hour: 1, puffs: 10, urges: 0, outward: 1, inward: 0 })
    expect(view.dial.peakHour).toBe(1)
    expect(view.dial.hours.flatMap((hour) => hour.puffs)).not.toContain(100)
  })

  it('counts only completed Known Logical Days during the Baseline', () => {
    const record = {
      ...emptyRecord,
      clearDays: [clearDay('2026-08-25'), clearDay('2026-08-27'), clearDay('2026-08-29')],
    }

    const view = buildStatsView(record, [], new Date('2026-08-29T12:00:00.000Z'), 'UTC')

    expect(view.programme).toEqual({ status: 'baseline', knownDays: 2, requiredDays: 7 })
  })

  it('breaks both 28-day trend lines across Unknown Logical Days', () => {
    const record = {
      ...emptyRecord,
      puffSessions: [session('known', '2026-08-27', '2026-08-27T12:00:00.000Z', 7)],
      clearDays: [clearDay('2026-08-29')],
      ratchetSteps: [step('2026-08-20', 8)],
    }

    const view = buildStatsView(record, [], new Date('2026-08-29T12:00:00.000Z'), 'UTC')

    expect(view.trend.slice(-3)).toEqual([
      { logicalDay: '2026-08-27', total: 7, target: 8 },
      { logicalDay: '2026-08-28', total: null, target: null },
      { logicalDay: '2026-08-29', total: 0, target: 8 },
    ])
  })

  it('counts backup exposure from the last export and surfaces the Longest Gap reading', () => {
    const record = {
      ...emptyRecord,
      puffSessions: [
        session('first', '2026-08-20', '2026-08-20T12:00:00.000Z', 1),
        session('second', '2026-08-23', '2026-08-23T12:00:00.000Z', 1),
      ],
      clearDays: [clearDay('2026-08-23'), clearDay('2026-08-24'), clearDay('2026-08-25')],
      ratchetSteps: [step('2026-08-19', 5)],
    }
    const exports: ExportRecord[] = [
      { id: 'backup', at: '2026-08-21T12:00:00.000Z', logicalDay: '2026-08-21' },
    ]

    const view = buildStatsView(record, exports, new Date('2026-08-25T18:00:00.000Z'), 'UTC')

    expect(view.backup.uncoveredKnownDays).toBe(3)
    expect(view.longestGap).toEqual({ milliseconds: 54 * 60 * 60 * 1000, disqualifiedByUnknownDay: true })
  })

  it('retires programme estimates at Target 0 while keeping Longest Gap and Momentum', () => {
    const record = {
      ...emptyRecord,
      puffSessions: [session('first', '2026-08-27', '2026-08-27T12:00:00.000Z', 1)],
      clearDays: [clearDay('2026-08-28'), clearDay('2026-08-29')],
      ratchetSteps: [step('2026-08-20', 0)],
    }

    const view = buildStatsView(record, [], new Date('2026-08-29T18:00:00.000Z'), 'UTC')

    expect(view.programme).toMatchObject({ status: 'target-zero', momentum: 1, stepBackAvailable: true })
    expect(view.programme).not.toHaveProperty('stepsRemaining')
    expect(view.programme).not.toHaveProperty('quitHorizon')
    expect(view.longestGap.milliseconds).toBe(54 * 60 * 60 * 1000)
  })

  it('carries Kicks Marked beside the Dial it shares a window with, in every programme state', () => {
    const puffSessions = [
      kickedSession('oldest', '2026-08-16', '2026-08-16T21:00:00.000Z'),
      session('unmarked', '2026-08-20', '2026-08-20T21:00:00.000Z', 5),
      kickedSession('today', '2026-08-29', '2026-08-29T17:00:00.000Z'),
    ]
    const now = new Date('2026-08-29T18:00:00.000Z')

    // One figure, one window, three programme states: the Baseline, an active
    // Target and Target 0 read the same record identically, because the count
    // touches no mechanism and the view holds it outside `programme`.
    const baseline = buildStatsView({ ...emptyRecord, puffSessions }, [], now, 'UTC')
    const active = buildStatsView(
      { ...emptyRecord, puffSessions, ratchetSteps: [step('2026-08-24', 10)] },
      [],
      now,
      'UTC',
    )
    const targetZero = buildStatsView(
      { ...emptyRecord, puffSessions, ratchetSteps: [step('2026-08-24', 0)] },
      [],
      now,
      'UTC',
    )

    expect(baseline.programme.status).toBe('baseline')
    expect(targetZero.programme.status).toBe('target-zero')
    expect([baseline.kicksMarked, active.kicksMarked, targetZero.kicksMarked]).toEqual([2, 2, 2])
  })

  it('moves the Kick window with the Dial and empties the reading rather than showing none', () => {
    const record = {
      ...emptyRecord,
      puffSessions: [kickedSession('oldest', '2026-08-16', '2026-08-16T21:00:00.000Z')],
    }

    // The Dial's oldest drawn day and the Kick's oldest counted day are the
    // same day, and they leave together.
    const inside = buildStatsView(record, [], new Date('2026-08-29T18:00:00.000Z'), 'UTC')
    const outside = buildStatsView(record, [], new Date('2026-08-30T18:00:00.000Z'), 'UTC')

    expect(inside.dial.knownDays).toBe(1)
    expect(inside.kicksMarked).toBe(1)
    expect(outside.dial.knownDays).toBe(0)
    expect(outside.kicksMarked).toBeUndefined()
  })

  it('withholds the step-back on a Logical Day that already carries a Step', () => {
    const record = {
      ...emptyRecord,
      clearDays: [clearDay('2026-08-29')],
      ratchetSteps: [step('2026-08-29', 0)],
    }

    const view = buildStatsView(record, [], new Date('2026-08-29T18:00:00.000Z'), 'UTC')

    expect(view.programme).toMatchObject({ status: 'target-zero', stepBackAvailable: false })
  })
})
