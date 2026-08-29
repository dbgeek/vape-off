import { describe, expect, it } from 'vitest'
import type { PuffSession, RatchetStep } from '../store/records.ts'
import type { DayLedgerRecord } from './day-ledger.ts'
import { nextEarnedTarget, targetOn, windowSatisfied } from './ratchet.ts'

const emptyRecord: DayLedgerRecord = {
  puffSessions: [],
  resistedUrges: [],
  clearDays: [],
  ratchetSteps: [],
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

describe('Ratchet', () => {
  it.each([
    [18, 16],
    [16, 14],
    [15, 13],
    [14, 13],
    [2, 1],
  ])('earns the next Target from %i as %i', (current, expected) => {
    expect(nextEarnedTarget(current)).toBe(expected)
  })

  it('reads the latest Step in force on a Logical Day regardless of record order', () => {
    const record = {
      ...emptyRecord,
      ratchetSteps: [ratchetStep('2026-08-20', 18), ratchetStep('2026-08-14', 20)],
    }

    expect(targetOn(record, '2026-08-13')).toBeUndefined()
    expect(targetOn(record, '2026-08-18')).toBe(20)
    expect(targetOn(record, '2026-08-25')).toBe(18)
  })

  it('cannot satisfy a Step window before the six-day cadence floor', () => {
    const step = ratchetStep('2026-08-20', 10)
    const record = {
      ...emptyRecord,
      puffSessions: ['21', '22', '23', '24', '25'].map((day) =>
        puffSession(`2026-08-${day}`, 10),
      ),
      ratchetSteps: [step],
    }

    expect(windowSatisfied(record, step, '2026-08-25')).toBe(false)
    expect(windowSatisfied(record, step, '2026-08-26')).toBe(true)
  })

  it.each([
    [18, 16],
    [54, 26],
    [135, 35],
  ])(
    'descends from first Target %i in %i total Steps',
    (firstTarget, expectedSteps) => {
      let target = firstTarget
      let steps = 0

      while (target > 1) {
        target = nextEarnedTarget(target)
        steps += 1
      }

      steps += 1 // the Declared handover from Target 1 to Target 0
      expect(steps).toBe(expectedSteps)
    },
  )

  it('keeps the last fourteen Steps as single-puff decrements', () => {
    const descent = [14]
    while (descent.at(-1)! > 1) descent.push(nextEarnedTarget(descent.at(-1)!))
    descent.push(0)

    expect(descent).toEqual([14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0])
  })
})
