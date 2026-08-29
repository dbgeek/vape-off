import { describe, expect, it } from 'vitest'
import type { ClearDay, PuffSession, RatchetStep } from '../store/records.ts'
import type { DayLedgerRecord } from './day-ledger.ts'
import {
  longestGap,
  momentum,
  pace,
  quitHorizon,
  stepCadence,
  stepsRemaining,
} from './readouts.ts'

const emptyRecord: DayLedgerRecord = {
  puffSessions: [],
  resistedUrges: [],
  clearDays: [],
  ratchetSteps: [],
}

function puffSession(logicalDay: string, count: number): PuffSession {
  return {
    id: `session-${logicalDay}`,
    at: `${logicalDay}T12:00:00.000Z`,
    lastTapAt: `${logicalDay}T12:01:00.000Z`,
    count,
    logicalDay,
    tz: 'UTC',
  }
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
    at: `${effectiveFrom}T04:00:00.000Z`,
  }
}

describe('readouts', () => {
  it('holds Momentum across gaps and Baseline days, subtracting without reaching below zero', () => {
    const record = {
      ...emptyRecord,
      puffSessions: [
        puffSession('2026-08-01', 20), // Baseline: ignored
        puffSession('2026-08-03', 11), // over: remains zero
        puffSession('2026-08-05', 8),
        puffSession('2026-08-06', 9),
        puffSession('2026-08-08', 12), // over: loses one, not everything
      ],
      ratchetSteps: [ratchetStep('2026-08-02', 10)],
    }

    expect(momentum(record, '2026-08-10')).toBe(1)
  })

  it('spreads Pace from the later anchor and goes silent when its reading would be dishonest', () => {
    const targetFour = {
      ...emptyRecord,
      ratchetSteps: [ratchetStep('2026-08-20', 4)],
    }

    expect(pace(emptyRecord, new Date('2026-08-29T12:00:00.000Z'), 'UTC')).toBeUndefined()
    expect(pace(targetFour, new Date('2026-08-29T23:00:00.000Z'), 'UTC')).toBeUndefined()
    expect(
      pace(
        { ...targetFour, ratchetSteps: [ratchetStep('2026-08-20', 100)] },
        new Date('2026-08-29T12:00:00.000Z'),
        'UTC',
      ),
    ).toBeUndefined()
    expect(
      pace(
        { ...targetFour, puffSessions: [puffSession('2026-08-29', 4)] },
        new Date('2026-08-29T12:00:00.000Z'),
        'UTC',
      ),
    ).toBeUndefined()

    const lastSession = puffSession('2026-08-29', 1)
    const anchored = pace(
      { ...targetFour, puffSessions: [lastSession] },
      new Date('2026-08-29T12:00:00.000Z'),
      'UTC',
    )
    expect(anchored).toEqual({
      intervalMs: 13_200_000,
      nextDue: '2026-08-29T15:40:00.000Z',
      slots: [
        '2026-08-29T15:40:00.000Z',
        '2026-08-29T19:20:00.000Z',
        '2026-08-29T23:00:00.000Z',
      ],
    })

    const morning = pace(targetFour, new Date('2026-08-29T08:00:00.000Z'), 'UTC')
    const noon = pace(targetFour, new Date('2026-08-29T12:00:00.000Z'), 'UTC')
    expect(morning?.nextDue).toBe('2026-08-29T10:45:00.000Z')
    expect(noon?.nextDue).toBe('2026-08-29T09:45:00.000Z')

    const holdOut = pace(
      { ...emptyRecord, ratchetSteps: [ratchetStep('2026-08-20', 1)] },
      new Date('2026-08-29T07:00:00.000Z'),
      'UTC',
    )
    expect(holdOut?.intervalMs).toBe(16 * 60 * 60 * 1000)
    expect(holdOut?.nextDue).toBe('2026-08-29T23:00:00.000Z')
  })

  it('counts the exact descent including the handover and measures only Earned Step cadence', () => {
    expect(stepsRemaining(emptyRecord, '2026-08-29')).toBeUndefined()
    expect(
      stepsRemaining(
        { ...emptyRecord, ratchetSteps: [ratchetStep('2026-08-20', 0, 'declared')] },
        '2026-08-29',
      ),
    ).toBeUndefined()
    expect(
      stepsRemaining(
        { ...emptyRecord, ratchetSteps: [ratchetStep('2026-08-20', 1)] },
        '2026-08-29',
      ),
    ).toBe(1)
    expect(
      [
        [18, 16],
        [54, 26],
        [135, 35],
      ].map(([target, expected]) => [
        stepsRemaining(
          { ...emptyRecord, ratchetSteps: [ratchetStep('2026-08-20', target!)] },
          '2026-08-29',
        ),
        expected,
      ]),
    ).toEqual([
      [16, 16],
      [26, 26],
      [35, 35],
    ])

    const record = {
      ...emptyRecord,
      ratchetSteps: [
        ratchetStep('2026-08-19', 8),
        ratchetStep('2026-08-09', 0, 'declared'),
        ratchetStep('2026-08-07', 9),
        ratchetStep('2026-08-01', 10),
      ],
    }
    expect(stepCadence(record)).toBe(9)
    expect(stepCadence({ ...emptyRecord, ratchetSteps: [ratchetStep('2026-08-01', 10)] })).toBeUndefined()
  })

  it('shows a coarse Quit Horizon only while the Earned Step cadence is credible', () => {
    expect(quitHorizon(emptyRecord, '2026-08-08')).toBeUndefined()
    expect(
      quitHorizon(
        { ...emptyRecord, ratchetSteps: [ratchetStep('2026-08-01', 10)] },
        '2026-08-08',
      ),
    ).toBeUndefined()
    expect(
      quitHorizon(
        {
          ...emptyRecord,
          ratchetSteps: [ratchetStep('2026-08-01', 2), ratchetStep('2026-08-07', 1)],
        },
        '2026-08-20',
      ),
    ).toBeUndefined()
    expect(
      quitHorizon(
        {
          ...emptyRecord,
          ratchetSteps: [
            ratchetStep('2026-08-01', 20),
            ratchetStep('2026-08-07', 18),
          ],
        },
        '2026-08-08',
      ),
    ).toEqual({ precision: 'months', value: 3 })
    expect(
      quitHorizon(
        {
          ...emptyRecord,
          ratchetSteps: [
            ratchetStep('2026-08-01', 3),
            ratchetStep('2026-08-15', 2),
          ],
        },
        '2026-08-20',
      ),
    ).toEqual({ precision: 'weeks', value: 4 })
    expect(
      quitHorizon(
        {
          ...emptyRecord,
          ratchetSteps: [
            ratchetStep('2026-08-01', 2),
            ratchetStep('2026-08-07', 1),
          ],
        },
        '2026-08-08',
      ),
    ).toEqual({ precision: 'date', value: '2026-08-14' })
    expect(
      quitHorizon(
        { ...emptyRecord, ratchetSteps: [ratchetStep('2026-08-01', 0, 'declared')] },
        '2026-08-08',
      ),
    ).toBeUndefined()
  })

  it('measures only Puff Session gaps lying wholly within Known Logical Days', () => {
    expect(longestGap(emptyRecord, new Date('2026-08-14T08:00:00.000Z'), '2026-08-14')).toBeUndefined()

    const first = {
      ...puffSession('2026-08-01', 1),
      at: '2026-08-01T10:00:00.000Z',
    }
    const second = {
      ...puffSession('2026-08-02', 1),
      at: '2026-08-02T08:00:00.000Z',
    }
    const absentForTwelveDays = { ...emptyRecord, puffSessions: [second, first] }
    expect(
      longestGap(
        absentForTwelveDays,
        new Date('2026-08-14T08:00:00.000Z'),
        '2026-08-14',
      ),
    ).toBe(22 * 60 * 60 * 1000)

    const clearDays: ClearDay[] = ['21', '22', '23'].map((day) => ({
      at: `2026-08-${day}T20:00:00.000Z`,
      logicalDay: `2026-08-${day}`,
      tz: 'UTC',
    }))
    expect(
      longestGap(
        {
          ...emptyRecord,
          puffSessions: [
            { ...puffSession('2026-08-20', 1), at: '2026-08-20T12:00:00.000Z' },
          ],
          clearDays,
        },
        new Date('2026-08-23T18:00:00.000Z'),
        '2026-08-23',
      ),
    ).toBe(78 * 60 * 60 * 1000)
  })
})
