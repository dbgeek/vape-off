import { describe, expect, it } from 'vitest'
import type { ClearDay, PuffSession, RatchetStep } from '../store/records.ts'
import type { DayLedgerRecord } from './day-ledger.ts'
import { decideStep, nextEarnedTarget } from './ratchet.ts'

const emptyRecord: DayLedgerRecord = {
  puffSessions: [],
  resistedUrges: [],
  clearDays: [],
  ratchetSteps: [],
}

function ratchetStep(
  effectiveFrom: string,
  target: number,
  kind: RatchetStep['kind'] = 'earned',
): RatchetStep {
  return {
    id: `step-${effectiveFrom}`,
    effectiveFrom,
    target,
    kind,
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

function clearDay(logicalDay: string): ClearDay {
  return {
    logicalDay,
    at: `${logicalDay}T20:00:00.000+02:00`,
    tz: 'Europe/Stockholm',
  }
}

/** `count` Logical Days ending the day before `before`, each at `puffs`. */
function daysBefore(before: string, count: number, puffs: number): PuffSession[] {
  const start = new Date(`${before}T00:00:00.000Z`)
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(start)
    day.setUTCDate(day.getUTCDate() - (count - index))
    return puffSession(day.toISOString().slice(0, 10), puffs)
  })
}

describe('the Ratchet', () => {
  it.each([
    [18, 16],
    [16, 14],
    [15, 13],
    [14, 13],
    [2, 1],
  ])('earns the next Target from %i as %i', (current, expected) => {
    expect(nextEarnedTarget(current)).toBe(expected)
  })

  it.each([
    [18, 16],
    [54, 26],
    [135, 35],
  ])('descends from first Target %i in %i total Steps', (firstTarget, expectedSteps) => {
    let target = firstTarget
    let steps = 0

    while (target > 1) {
      target = nextEarnedTarget(target)
      steps += 1
    }

    steps += 1 // the Declared handover from Target 1 to Target 0
    expect(steps).toBe(expectedSteps)
  })

  it('keeps the last fourteen Steps as single-puff decrements', () => {
    const descent = [14]
    while (descent.at(-1)! > 1) descent.push(nextEarnedTarget(descent.at(-1)!))
    descent.push(0)

    expect(descent).toEqual([14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0])
  })

  describe('closing the Baseline', () => {
    it.each([
      [20, 18],
      [60, 54],
      [150, 135],
    ])('opens Baseline Average %i at first Target %i', (average, target) => {
      const record = { ...emptyRecord, puffSessions: daysBefore('2026-08-29', 7, average) }

      expect(decideStep(record, '2026-08-29', 'evaluate')).toEqual({
        status: 'step',
        target,
        kind: 'earned',
      })
    })

    it('holds while the Baseline is short of seven Known Logical Days', () => {
      const record = { ...emptyRecord, puffSessions: daysBefore('2026-08-29', 6, 20) }

      expect(decideStep(record, '2026-08-29', 'evaluate')).toEqual({ status: 'unchanged' })
    })

    it('opens a seven-Clear-Day Baseline at Target 1 rather than Target 0', () => {
      const record = {
        ...emptyRecord,
        clearDays: ['22', '23', '24', '25', '26', '27', '28'].map((day) =>
          clearDay(`2026-08-${day}`),
        ),
      }

      expect(decideStep(record, '2026-08-29', 'evaluate')).toMatchObject({
        status: 'step',
        target: 1,
      })
    })
  })

  describe('stepping down', () => {
    it('cannot satisfy the window before the six-day cadence floor', () => {
      const record = {
        ...emptyRecord,
        puffSessions: ['21', '22', '23', '24', '25'].map((day) =>
          puffSession(`2026-08-${day}`, 10),
        ),
        ratchetSteps: [ratchetStep('2026-08-20', 10)],
      }

      expect(decideStep(record, '2026-08-25', 'evaluate')).toEqual({ status: 'unchanged' })
      expect(decideStep(record, '2026-08-26', 'evaluate')).toEqual({
        status: 'step',
        target: 9,
        kind: 'earned',
      })
    })

    it('decides one Step, not a catch-up run, when a long backfill satisfies the window', () => {
      const record = {
        ...emptyRecord,
        puffSessions: Array.from({ length: 12 }, (_, index) =>
          puffSession(`2026-08-${String(index + 11).padStart(2, '0')}`, 20),
        ),
        ratchetSteps: [ratchetStep('2026-08-10', 20)],
      }

      expect(decideStep(record, '2026-08-23', 'evaluate')).toEqual({
        status: 'step',
        target: 18,
        kind: 'earned',
      })
    })

    it('stalls rather than steps after a seven-day absence', () => {
      const record = { ...emptyRecord, ratchetSteps: [ratchetStep('2026-08-20', 10)] }

      expect(decideStep(record, '2026-08-29', 'evaluate')).toEqual({ status: 'unchanged' })
    })

    it('never judges a day by a Target that took effect on it', () => {
      const record = {
        ...emptyRecord,
        puffSessions: ['20', '21', '22', '23', '24', '25'].map((day) =>
          puffSession(`2026-08-${day}`, 10),
        ),
        ratchetSteps: [ratchetStep('2026-08-20', 10)],
      }

      // Six Met-looking days, but the day the Step landed is not among the five.
      expect(decideStep(record, '2026-08-25', 'evaluate')).toEqual({ status: 'unchanged' })
    })
  })

  describe('the Target 1 handover', () => {
    const heldTargetOne = {
      ...emptyRecord,
      puffSessions: ['21', '22', '23', '24', '25'].map((day) =>
        puffSession(`2026-08-${day}`, 1),
      ),
      ratchetSteps: [ratchetStep('2026-08-20', 1)],
    }

    it('offers the last step down rather than writing it', () => {
      expect(decideStep(heldTargetOne, '2026-08-26', 'evaluate')).toEqual({
        status: 'handover-offered',
      })
    })

    it('writes Target 0 as a Declared Step once it is taken', () => {
      expect(decideStep(heldTargetOne, '2026-08-26', 'handover')).toEqual({
        status: 'step',
        target: 0,
        kind: 'declared',
      })
    })

    it('refuses a handover that has not been earned', () => {
      expect(decideStep(heldTargetOne, '2026-08-25', 'evaluate')).toEqual({
        status: 'unchanged',
      })
      expect(decideStep(heldTargetOne, '2026-08-25', 'handover')).toEqual({
        status: 'refused',
        reason: 'handover-unavailable',
      })
    })

    it('refuses a handover above Target 1', () => {
      const record = { ...emptyRecord, ratchetSteps: [ratchetStep('2026-08-20', 4)] }

      expect(decideStep(record, '2026-08-26', 'handover')).toEqual({
        status: 'refused',
        reason: 'handover-unavailable',
      })
    })
  })

  describe('at Target 0', () => {
    const atTargetZero = {
      ...emptyRecord,
      ratchetSteps: [ratchetStep('2026-08-20', 0, 'declared')],
    }

    it('lies dormant rather than finished', () => {
      expect(decideStep(atTargetZero, '2026-08-29', 'evaluate')).toEqual({
        status: 'unchanged',
      })
    })

    it('declares the only raise the programme allows', () => {
      expect(decideStep(atTargetZero, '2026-08-21', 'step-back')).toEqual({
        status: 'step',
        target: 1,
        kind: 'declared',
      })
    })

    it('refuses a step back anywhere else on the descent', () => {
      const record = { ...emptyRecord, ratchetSteps: [ratchetStep('2026-08-20', 1)] }

      expect(decideStep(record, '2026-08-26', 'step-back')).toEqual({
        status: 'refused',
        reason: 'not-at-target-zero',
      })
    })

    it('refuses a step back during the Baseline, which has no Target to leave', () => {
      expect(decideStep(emptyRecord, '2026-08-26', 'step-back')).toEqual({
        status: 'refused',
        reason: 'not-at-target-zero',
      })
    })
  })

  describe('one Step per Logical Day', () => {
    const steppedToday = {
      ...emptyRecord,
      puffSessions: daysBefore('2026-08-29', 7, 20),
      ratchetSteps: [ratchetStep('2026-08-29', 18)],
    }

    it('is silent to the Ratchet, which is only sweeping', () => {
      expect(decideStep(steppedToday, '2026-08-29', 'evaluate')).toEqual({
        status: 'unchanged',
      })
    })

    it.each(['handover', 'step-back'] as const)(
      'tells a %s tap why it was refused',
      (request) => {
        expect(decideStep(steppedToday, '2026-08-29', request)).toEqual({
          status: 'refused',
          reason: 'already-stepped-today',
        })
      },
    )
  })
})
