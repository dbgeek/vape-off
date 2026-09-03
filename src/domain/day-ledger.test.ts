import { describe, expect, it } from 'vitest'
import type { ClearDay, PuffSession, RatchetStep, ResistedUrge } from '../store/records.ts'
import {
  baselineAverage,
  baselineDays,
  completedDays,
  dayTotal,
  isCompleted,
  isKnown,
  isMet,
  knownLogicalDayKeys,
  type DayLedgerRecord,
} from './day-ledger.ts'

const emptyRecord: DayLedgerRecord = {
  puffSessions: [],
  resistedUrges: [],
  clearDays: [],
  ratchetSteps: [],
}

function puffSession(logicalDay: string, count: number): PuffSession {
  return {
    id: `session-${logicalDay}`,
    at: `${logicalDay}T12:00:00.000+02:00`,
    lastTapAt: `${logicalDay}T12:01:00.000+02:00`,
    count,
    logicalDay,
    tz: 'Europe/Stockholm',
  }
}

function ratchetStep(effectiveFrom: string, target: number): RatchetStep {
  return {
    id: `step-${effectiveFrom}`,
    effectiveFrom,
    target,
    kind: 'earned',
    at: `${effectiveFrom}T04:00:00.000+02:00`,
  }
}

function resistedUrge(logicalDay: string): ResistedUrge {
  return {
    id: `urge-${logicalDay}`,
    at: `${logicalDay}T18:00:00.000+02:00`,
    logicalDay,
    tz: 'Europe/Stockholm',
  }
}

describe('day ledger', () => {
  it('reads a Clear Day as a Known zero', () => {
    const clearDay: ClearDay = {
      at: '2026-08-28T20:00:00.000+02:00',
      logicalDay: '2026-08-28',
      tz: 'Europe/Stockholm',
    }
    const record = { ...emptyRecord, clearDays: [clearDay] }

    expect(dayTotal(record, '2026-08-28')).toBe(0)
    expect(isKnown(record, '2026-08-28')).toBe(true)
  })

  it('lists consecutive completed Logical Days and excludes today', () => {
    expect(isCompleted('2026-08-29', '2026-08-29')).toBe(false)
    expect(isCompleted('2026-08-28', '2026-08-29')).toBe(true)
    expect(completedDays(3, '2026-03-01')).toEqual([
      '2026-02-26',
      '2026-02-27',
      '2026-02-28',
    ])
  })

  it('extends the Baseline across an Unknown Logical Day', () => {
    const sixKnownDays = [
      puffSession('2026-08-22', 1),
      puffSession('2026-08-23', 2),
      puffSession('2026-08-24', 3),
      puffSession('2026-08-25', 4),
      puffSession('2026-08-26', 5),
      puffSession('2026-08-27', 6),
    ]

    expect(baselineDays({ ...emptyRecord, puffSessions: sixKnownDays }, '2026-08-29')).toBeUndefined()

    const record = {
      ...emptyRecord,
      puffSessions: [...sixKnownDays, puffSession('2026-08-28', 7)],
    }
    expect(baselineDays(record, '2026-08-29')).toEqual([
      '2026-08-22',
      '2026-08-23',
      '2026-08-24',
      '2026-08-25',
      '2026-08-26',
      '2026-08-27',
      '2026-08-28',
    ])
    expect(baselineAverage(record, '2026-08-29')).toBe(4)
  })

  it('never judges an Unknown Logical Day as Met', () => {
    const record = { ...emptyRecord, ratchetSteps: [ratchetStep('2026-08-20', 10)] }

    expect(isMet(record, '2026-08-28', '2026-08-29')).toBe(false)
  })

  it.each([0, 1, 10])(
    'judges a Resisted-Urge-only completed Logical Day as Met at Target %i',
    (target) => {
      const record = {
        ...emptyRecord,
        resistedUrges: [resistedUrge('2026-08-28')],
        ratchetSteps: [ratchetStep('2026-08-20', target)],
      }

      expect(isKnown(record, '2026-08-28')).toBe(true)
      expect(isMet(record, '2026-08-28', '2026-08-29')).toBe(true)
    },
  )

  it('never judges today, even when it is Known and within Target', () => {
    const record = {
      ...emptyRecord,
      puffSessions: [puffSession('2026-08-29', 1)],
      ratchetSteps: [ratchetStep('2026-08-20', 10)],
    }

    expect(isMet(record, '2026-08-29', '2026-08-29')).toBe(false)
  })

  it('does not judge a Known Baseline day before a Target is in force', () => {
    const record = { ...emptyRecord, puffSessions: [puffSession('2026-08-19', 1)] }

    expect(isMet(record, '2026-08-19', '2026-08-29')).toBe(false)
  })

  it('sums every Puff Session stamped to the Logical Day', () => {
    const first = puffSession('2026-08-28', 2)
    const second = { ...puffSession('2026-08-28', 3), id: 'second-session' }

    expect(dayTotal({ ...emptyRecord, puffSessions: [first, second] }, '2026-08-28')).toBe(5)
  })

  it('judges a completed Known Logical Day against the Target then in force', () => {
    const record = {
      ...emptyRecord,
      puffSessions: [puffSession('2026-08-25', 6), puffSession('2026-08-28', 6)],
      ratchetSteps: [ratchetStep('2026-08-27', 10), ratchetStep('2026-08-20', 5)],
    }

    expect(isMet(record, '2026-08-25', '2026-08-29')).toBe(false)
    expect(isMet(record, '2026-08-28', '2026-08-29')).toBe(true)
  })
})

/**
 * The index behind the ledger (see `day-ledger.ts`).
 *
 * Timing is not the assertion — a budget in milliseconds passes or fails on
 * whatever else the machine happens to be doing. What is asserted is the
 * property that makes the cost linear: one index per record, shared by every
 * question, and never carried across to a different record.
 */
describe('the day ledger index', () => {
  it('answers every question about one record from a single shared index', () => {
    const record = { ...emptyRecord, puffSessions: [puffSession('2026-08-28', 2)] }

    // The same instance, not merely an equal one: a fresh Set per call is the
    // walk of the whole record this index exists to stop repeating.
    expect(knownLogicalDayKeys(record)).toBe(knownLogicalDayKeys(record))
  })

  it('never carries one record’s index onto another', () => {
    const before = { ...emptyRecord, puffSessions: [puffSession('2026-08-28', 2)] }
    const after = {
      ...emptyRecord,
      puffSessions: [puffSession('2026-08-28', 2), puffSession('2026-08-29', 5)],
    }

    expect(dayTotal(before, '2026-08-29')).toBe(0)
    expect(isKnown(before, '2026-08-29')).toBe(false)
    expect(dayTotal(after, '2026-08-29')).toBe(5)
    expect(isKnown(after, '2026-08-29')).toBe(true)
  })
})
