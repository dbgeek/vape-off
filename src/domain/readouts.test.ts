import { describe, expect, it } from 'vitest'
import type { ClearDay, PuffSession, RatchetStep } from '../store/records.ts'
import { dayTotal, isMet, type DayLedgerRecord } from './day-ledger.ts'
import {
  DIAL_WINDOW_DAYS,
  isInDialWindow,
  currentGap,
  kicksMarked,
  longestGap,
  momentum,
  pace,
  quitHorizon,
  spacing,
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

/** The same sitting, with the Kick you volunteered on it. */
function kickedSession(logicalDay: string, count = 3): PuffSession {
  return { ...puffSession(logicalDay, count), kickMarkedAt: `${logicalDay}T12:05:00.000Z` }
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
    expect(stepsRemaining(emptyRecord, '2026-08-29')).toEqual({ status: 'absent' })
    expect(
      stepsRemaining(
        { ...emptyRecord, ratchetSteps: [ratchetStep('2026-08-20', 0, 'declared')] },
        '2026-08-29',
      ),
    ).toEqual({ status: 'retired' })
    expect(
      stepsRemaining(
        { ...emptyRecord, ratchetSteps: [ratchetStep('2026-08-20', 1)] },
        '2026-08-29',
      ),
    ).toEqual({ status: 'available', value: 1 })
    expect(
      [18, 54, 135].map((target) =>
        stepsRemaining(
          { ...emptyRecord, ratchetSteps: [ratchetStep('2026-08-20', target!)] },
          '2026-08-29',
        ),
      ),
    ).toEqual([
      { status: 'available', value: 16 },
      { status: 'available', value: 26 },
      { status: 'available', value: 35 },
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
    expect(quitHorizon(emptyRecord, '2026-08-08')).toEqual({ status: 'absent' })
    expect(
      quitHorizon(
        { ...emptyRecord, ratchetSteps: [ratchetStep('2026-08-01', 10)] },
        '2026-08-08',
      ),
    ).toEqual({ status: 'absent' })
    expect(
      quitHorizon(
        {
          ...emptyRecord,
          ratchetSteps: [ratchetStep('2026-08-01', 2), ratchetStep('2026-08-07', 1)],
        },
        '2026-08-20',
      ),
    ).toEqual({ status: 'withdrawn' })
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
    ).toEqual({ status: 'available', precision: 'months', value: 3 })
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
    ).toEqual({ status: 'available', precision: 'weeks', value: 4 })
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
    ).toEqual({ status: 'available', precision: 'date', value: '2026-08-14' })
    expect(
      quitHorizon(
        { ...emptyRecord, ratchetSteps: [ratchetStep('2026-08-01', 0, 'declared')] },
        '2026-08-08',
      ),
    ).toEqual({ status: 'retired' })
  })

  describe('Spacing', () => {
    /** A sitting of `count` on `logicalDay`, distinct from every other one. */
    function sitting(id: string, logicalDay: string, count: number): PuffSession {
      return { ...puffSession(logicalDay, count), id }
    }

    /** Five sittings of five before today: the record's habit. */
    const habitOfFive = ['2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28'].map(
      (logicalDay) => sitting(`habit-${logicalDay}`, logicalDay, 5),
    )

    /** The record as it stood when the spec was written: Target 223, never stepped. */
    const firstTarget = {
      ...emptyRecord,
      puffSessions: habitOfFive,
      ratchetSteps: [ratchetStep('2026-08-20', 223)],
    }

    const opening = new Date('2026-08-29T07:00:00.000Z')
    const noon = new Date('2026-08-29T12:00:00.000Z')

    it('cuts the Target into sittings scaled from your habit, as the record reads today', () => {
      const reading = spacing(firstTarget, opening, 'UTC')

      // floor(0.9 × 5) = 4 puffs a sitting; ceil(223 / 4) = 56 sittings across 16 hours.
      expect(reading?.puffs).toBe(4)
      expect(reading?.slots).toHaveLength(56)
      expect(reading?.intervalMs).toBeCloseTo(17 * 60 * 1000 + 8_571.43, 1)
      expect(reading?.nextDue).toBe(reading?.slots[0])
      expect(reading?.slots.at(-1)).toBe('2026-08-29T23:00:00.000Z')
    })

    it('is Pace when a sitting is one puff', () => {
      const record = {
        ...emptyRecord,
        puffSessions: [sitting('today', '2026-08-29', 2)],
        // floor(2 × 10 × 0.9 / 24) = 0, floored at one puff.
        ratchetSteps: [ratchetStep('2026-08-01', 24), ratchetStep('2026-08-20', 10)],
      }

      const reading = spacing(record, noon, 'UTC')

      expect(reading?.puffs).toBe(1)
      expect(reading?.intervalMs).toBe(pace(record, noon, 'UTC')?.intervalMs)
      expect(reading?.nextDue).toBe(pace(record, noon, 'UTC')?.nextDue)
      expect(reading?.slots).toEqual(pace(record, noon, 'UTC')?.slots)
    })

    it("prints what is left when it is less than a sitting, as the day's last slot", () => {
      const record = {
        ...firstTarget,
        puffSessions: [...habitOfFive, sitting('today', '2026-08-29', 220)],
      }

      const reading = spacing(record, noon, 'UTC')

      expect(reading?.puffs).toBe(3)
      expect(reading?.slots).toEqual(['2026-08-29T23:00:00.000Z'])
    })

    it("is silent wherever Pace is, judging the ten minutes on its own interval", () => {
      const atZero = { ...firstTarget, ratchetSteps: [ratchetStep('2026-08-20', 0, 'declared')] }
      const nothingLeft = {
        ...firstTarget,
        puffSessions: [...habitOfFive, sitting('today', '2026-08-29', 223)],
      }
      // A habit of one is a size of one: 223 sittings at 07:00 is 4.3 minutes apiece.
      const habitOfOne = {
        ...firstTarget,
        puffSessions: habitOfFive.map((session) => ({ ...session, count: 1 })),
      }

      expect(spacing({ ...firstTarget, ratchetSteps: [] }, opening, 'UTC')).toBeUndefined()
      expect(spacing(atZero, opening, 'UTC')).toBeUndefined()
      expect(spacing(nothingLeft, noon, 'UTC')).toBeUndefined()
      expect(spacing(firstTarget, new Date('2026-08-29T06:59:00.000Z'), 'UTC')).toBeUndefined()
      expect(spacing(firstTarget, new Date('2026-08-29T23:00:00.000Z'), 'UTC')).toBeUndefined()
      expect(spacing(habitOfOne, opening, 'UTC')).toBeUndefined()
    })

    it('speaks on an evening Pace has gone quiet on', () => {
      // 20 left at 21:00 is six minutes a puff, but five sittings of four.
      const record = {
        ...firstTarget,
        puffSessions: [...habitOfFive, sitting('today', '2026-08-29', 203)],
      }
      const evening = new Date('2026-08-29T21:00:00.000Z')

      expect(pace(record, evening, 'UTC')).toBeUndefined()
      expect(spacing(record, evening, 'UTC')?.intervalMs).toBe(24 * 60 * 1000)
    })

    it('takes its habit from the 14 most recent Logical Days, and is silent with none in them', () => {
      const fourteenBack = {
        ...firstTarget,
        puffSessions: [sitting('edge', '2026-08-15', 5)],
      }
      const thirteenBack = {
        ...firstTarget,
        puffSessions: [sitting('edge', '2026-08-16', 5)],
      }

      expect(spacing({ ...firstTarget, puffSessions: [] }, opening, 'UTC')).toBeUndefined()
      expect(spacing(fourteenBack, opening, 'UTC')).toBeUndefined()
      expect(spacing(thirteenBack, opening, 'UTC')?.puffs).toBe(4)
    })

    it("counts today's sittings in the habit", () => {
      const record = { ...firstTarget, puffSessions: [sitting('today', '2026-08-29', 5)] }

      expect(spacing(record, noon, 'UTC')?.puffs).toBe(4)
    })

    it('takes the lower median on an even count', () => {
      const record = {
        ...emptyRecord,
        puffSessions: [sitting('small', '2026-08-27', 2), sitting('large', '2026-08-28', 10)],
        ratchetSteps: [ratchetStep('2026-08-20', 20)],
      }

      // A habit of 2, not 6 or 10: floor(0.9 × 2) = 1.
      expect(spacing(record, noon, 'UTC')?.puffs).toBe(1)
    })

    it('moves with a Correction that re-counts a sitting in the window', () => {
      const recounted = {
        ...firstTarget,
        puffSessions: habitOfFive.map((session, index) =>
          index < 3 ? { ...session, count: 10 } : session,
        ),
      }

      expect(spacing(firstTarget, opening, 'UTC')?.puffs).toBe(4)
      expect(spacing(recounted, opening, 'UTC')?.puffs).toBe(9)
    })

    it('scales by the Baseline Average as the first Step froze it', () => {
      const baseline = ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07'].map(
        (logicalDay) => sitting(`baseline-${logicalDay}`, logicalDay, 10),
      )
      const record = {
        ...emptyRecord,
        puffSessions: [...baseline, ...habitOfFive],
        // The Baseline Average of 10 froze as a first Target of 9; one Step since.
        ratchetSteps: [ratchetStep('2026-08-08', 9), ratchetStep('2026-08-20', 8)],
      }
      const backfilled = {
        ...record,
        puffSessions: [...record.puffSessions, sitting('backfill', '2026-08-03', 500)],
      }

      // floor(5 × 8 × 0.9 / 9) = 4, whatever the Baseline window says now.
      expect(spacing(record, opening, 'UTC')?.puffs).toBe(4)
      expect(spacing(backfilled, opening, 'UTC')?.puffs).toBe(4)
    })

    it('scales from the first Step even when the Baseline it closed was seven Clear Days', () => {
      const clearBaseline = {
        ...firstTarget,
        clearDays: ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07'].map((logicalDay) => ({
          logicalDay,
          at: `${logicalDay}T12:00:00.000Z`,
          tz: 'UTC',
        })),
        ratchetSteps: [ratchetStep('2026-08-08', 1)],
      }

      // A recomputed Baseline Average of 0 would divide by zero; the frozen one is 1.11.
      expect(spacing(clearBaseline, opening, 'UTC')?.puffs).toBe(1)
    })
  })

  const hours = (count: number) => count * 60 * 60 * 1000

  function sessionAt(logicalDay: string, at: string): PuffSession {
    return { ...puffSession(logicalDay, 1), id: `session-${at}`, at }
  }

  function clearDay(logicalDay: string): ClearDay {
    return { logicalDay, at: `${logicalDay}T20:00:00.000Z`, tz: 'UTC' }
  }

  describe('Longest Gap', () => {
    it('has nothing to measure and nothing to admit without a Puff Session', () => {
      expect(longestGap(emptyRecord, new Date('2026-08-14T08:00:00.000Z'), '2026-08-14')).toEqual({
        milliseconds: undefined,
        disqualifiedByUnknownDay: false,
      })
    })

    it('measures only stretches lying wholly within Known Logical Days', () => {
      // Twelve days away: the stretch since the last Puff Session crosses Unknown
      // Logical Days, so the 22 hours between the two known ones is all that stands.
      const record = {
        ...emptyRecord,
        puffSessions: [
          sessionAt('2026-08-02', '2026-08-02T08:00:00.000Z'),
          sessionAt('2026-08-01', '2026-08-01T10:00:00.000Z'),
        ],
      }

      expect(longestGap(record, new Date('2026-08-14T08:00:00.000Z'), '2026-08-14')).toEqual({
        milliseconds: hours(22),
        disqualifiedByUnknownDay: true,
      })
    })

    it('counts the still-running stretch on a morning with nothing logged yet, and admits nothing', () => {
      // Today is not yet judged, so the day still running disqualifies nothing.
      const record = {
        ...emptyRecord,
        puffSessions: [sessionAt('2026-08-28', '2026-08-28T23:00:00.000Z')],
      }

      expect(longestGap(record, new Date('2026-08-29T09:00:00.000Z'), '2026-08-29')).toEqual({
        milliseconds: hours(10),
        disqualifiedByUnknownDay: false,
      })
    })

    it('counts the still-running stretch when Clear Days vouch for it', () => {
      const record = {
        ...emptyRecord,
        puffSessions: [sessionAt('2026-08-20', '2026-08-20T12:00:00.000Z')],
        clearDays: ['21', '22', '23'].map((day) => clearDay(`2026-08-${day}`)),
      }

      expect(longestGap(record, new Date('2026-08-23T18:00:00.000Z'), '2026-08-23')).toEqual({
        milliseconds: hours(78),
        disqualifiedByUnknownDay: false,
      })
    })

    it('stays silent about an excluded stretch shorter than the figure it reports', () => {
      const record = {
        ...emptyRecord,
        puffSessions: [
          sessionAt('2026-08-20', '2026-08-20T12:00:00.000Z'),
          sessionAt('2026-08-22', '2026-08-22T12:00:00.000Z'),
        ],
        clearDays: ['23', '24'].map((day) => clearDay(`2026-08-${day}`)),
      }

      expect(longestGap(record, new Date('2026-08-24T18:00:00.000Z'), '2026-08-24')).toEqual({
        milliseconds: hours(54),
        disqualifiedByUnknownDay: false,
      })
    })

    it('owns up when an Unknown Logical Day excluded a longer stretch', () => {
      const record = {
        ...emptyRecord,
        puffSessions: [
          sessionAt('2026-08-20', '2026-08-20T12:00:00.000Z'),
          sessionAt('2026-08-23', '2026-08-23T12:00:00.000Z'),
        ],
        clearDays: ['23', '24', '25'].map((day) => clearDay(`2026-08-${day}`)),
      }

      expect(longestGap(record, new Date('2026-08-25T18:00:00.000Z'), '2026-08-25')).toEqual({
        milliseconds: hours(54),
        disqualifiedByUnknownDay: true,
      })
    })

    it('excludes a stretch whose Logical Days run backwards against the clock', () => {
      // Flying far enough west stamps a later Puff Session with an earlier Logical
      // Day than the one before it (ADR 0008: the key is written in the zone then
      // in force). Such an interval vouches for nothing, so it is excluded — and,
      // being the longest thing excluded, it has to be owned up to.
      const record = {
        ...emptyRecord,
        puffSessions: [
          {
            id: 'before-the-flight',
            logicalDay: '2026-08-29',
            at: '2026-08-29T14:00:00.000+14:00',
            lastTapAt: '2026-08-29T14:00:00.000+14:00',
            count: 1,
            tz: 'Pacific/Kiritimati',
          },
          {
            id: 'after-the-flight',
            logicalDay: '2026-08-28',
            at: '2026-08-28T23:00:00.000-11:00',
            lastTapAt: '2026-08-28T23:00:00.000-11:00',
            count: 1,
            tz: 'Pacific/Midway',
          },
          {
            id: 'later-that-night',
            logicalDay: '2026-08-28',
            at: '2026-08-29T01:00:00.000-11:00',
            lastTapAt: '2026-08-29T01:00:00.000-11:00',
            count: 1,
            tz: 'Pacific/Midway',
          },
        ],
      }

      expect(longestGap(record, new Date('2026-08-29T13:00:00.000Z'), '2026-08-29')).toEqual({
        milliseconds: hours(2),
        disqualifiedByUnknownDay: true,
      })
    })

    it('counts a Puff Session stamped ahead of the clock as neither run nor exclusion', () => {
      // Travelling east can stamp a Puff Session ahead of now. The stretch back to
      // it has negative length, which is evidence of nothing in either direction.
      const record = {
        ...emptyRecord,
        puffSessions: [sessionAt('2026-08-20', '2026-08-20T12:00:00.000Z')],
      }

      expect(longestGap(record, new Date('2026-08-20T06:00:00.000Z'), '2026-08-19')).toEqual({
        milliseconds: undefined,
        disqualifiedByUnknownDay: false,
      })
    })
  })

  describe('Current Gap', () => {
    it('runs on through a Logical Day with nothing on it yet, because today is not yet judged', () => {
      const record = {
        ...emptyRecord,
        puffSessions: [sessionAt('2026-08-28', '2026-08-28T23:00:00.000Z')],
      }

      expect(currentGap(record, new Date('2026-08-29T09:00:00.000Z'), '2026-08-29')).toBe(hours(10))
    })

    it('falls silent across a completed Logical Day with nothing on it, until it is declared Clear', () => {
      // Held off all of the 28th without writing anything: nothing tells that
      // apart from not using the app (ADR 0001). Declaring it Clear does.
      const record = {
        ...emptyRecord,
        puffSessions: [sessionAt('2026-08-27', '2026-08-27T22:00:00.000Z')],
      }
      const now = new Date('2026-08-29T09:00:00.000Z')

      expect(currentGap(record, now, '2026-08-29')).toBeUndefined()
      expect(
        currentGap({ ...record, clearDays: [clearDay('2026-08-28')] }, now, '2026-08-29'),
      ).toBe(hours(35))
    })

    it('always counts the stretch since a Puff Session logged today', () => {
      const record = {
        ...emptyRecord,
        puffSessions: [sessionAt('2026-08-29', '2026-08-29T09:00:00.000Z')],
      }

      expect(currentGap(record, new Date('2026-08-29T11:00:00.000Z'), '2026-08-29')).toBe(hours(2))
    })

    it('has nothing to say about a Puff Session stamped ahead of the clock', () => {
      // Travelling east can stamp a Puff Session ahead of now (ADR 0008).
      const record = {
        ...emptyRecord,
        puffSessions: [sessionAt('2026-08-29', '2026-08-29T12:00:00.000Z')],
      }

      expect(currentGap(record, new Date('2026-08-29T06:00:00.000Z'), '2026-08-29')).toBeUndefined()
    })

    it('has nothing to say when the latest Logical Day key runs ahead of today', () => {
      // Flying west after logging stamps today's key earlier than the session's.
      const record = {
        ...emptyRecord,
        puffSessions: [sessionAt('2026-08-30', '2026-08-29T10:00:00.000Z')],
      }

      expect(currentGap(record, new Date('2026-08-29T12:00:00.000Z'), '2026-08-29')).toBeUndefined()
    })

    it('has nothing to measure without a Puff Session', () => {
      expect(currentGap(emptyRecord, new Date('2026-08-29T12:00:00.000Z'), '2026-08-29')).toBeUndefined()
    })

    it('never reads longer than the Longest Gap beside it', () => {
      const scenarios: Array<[DayLedgerRecord, string, string]> = [
        // a morning with nothing logged yet
        [
          { ...emptyRecord, puffSessions: [sessionAt('2026-08-28', '2026-08-28T23:00:00.000Z')] },
          '2026-08-29T09:00:00.000Z',
          '2026-08-29',
        ],
        // Clear Days vouching for the run
        [
          {
            ...emptyRecord,
            puffSessions: [sessionAt('2026-08-20', '2026-08-20T12:00:00.000Z')],
            clearDays: ['21', '22', '23'].map((day) => clearDay(`2026-08-${day}`)),
          },
          '2026-08-23T18:00:00.000Z',
          '2026-08-23',
        ],
        // a longer stretch behind it, excluded by an Unknown Logical Day
        [
          {
            ...emptyRecord,
            puffSessions: [
              sessionAt('2026-08-20', '2026-08-20T12:00:00.000Z'),
              sessionAt('2026-08-23', '2026-08-23T12:00:00.000Z'),
            ],
          },
          '2026-08-24T09:00:00.000Z',
          '2026-08-24',
        ],
        // a longer eligible stretch behind it
        [
          {
            ...emptyRecord,
            puffSessions: [
              sessionAt('2026-08-20', '2026-08-20T08:00:00.000Z'),
              sessionAt('2026-08-21', '2026-08-21T20:00:00.000Z'),
              sessionAt('2026-08-22', '2026-08-22T10:00:00.000Z'),
            ],
          },
          '2026-08-22T11:00:00.000Z',
          '2026-08-22',
        ],
      ]

      for (const [record, now, today] of scenarios) {
        const running = currentGap(record, new Date(now), today)
        expect(running).toBeDefined()
        expect(longestGap(record, new Date(now), today).milliseconds).toBeGreaterThanOrEqual(running!)
      }
    })
  })

  describe('Kicks Marked', () => {
    it("counts the Kicked sittings across the Dial's own window, today's running day included", () => {
      const record = {
        ...emptyRecord,
        puffSessions: [
          kickedSession('2026-08-16'), // the window's oldest day
          puffSession('2026-08-20', 4), // a sitting you never marked
          kickedSession('2026-08-22'),
          kickedSession('2026-08-29'), // today, still running
        ],
      }

      // Marking reaches only today's sessions, so every Kick is born on today:
      // a window excluding it would hide the mark for up to 24 hours and read
      // as the app failing to register the act.
      expect(kicksMarked(record, '2026-08-29')).toBe(3)
    })

    it('drops a Kick from the reading the day it leaves the window, and not before', () => {
      const record = { ...emptyRecord, puffSessions: [kickedSession('2026-08-16')] }

      // Fourteen calendar-consecutive keys ending at today: the 16th is inside
      // the window on the 29th and outside it on the 30th, with nothing else
      // about the record changed.
      expect(kicksMarked(record, '2026-08-29')).toBe(1)
      expect(kicksMarked(record, '2026-08-30')).toBeUndefined()
    })

    it('counts Puff Sessions, and never rolls them up to Logical Days', () => {
      const record = {
        ...emptyRecord,
        puffSessions: [
          { ...kickedSession('2026-08-28'), id: 'morning' },
          { ...kickedSession('2026-08-28'), id: 'afternoon' },
          { ...kickedSession('2026-08-28'), id: 'evening' },
        ],
      }

      // A day with one Kick and a day with three are different facts, and the
      // session is the only unit a Kick was ever attached to.
      expect(kicksMarked(record, '2026-08-29')).toBe(3)
    })

    it('is absent at zero rather than reporting none, on the Quit Horizon pattern', () => {
      expect(kicksMarked(emptyRecord, '2026-08-29')).toBeUndefined()
      expect(
        kicksMarked({ ...emptyRecord, puffSessions: [puffSession('2026-08-28', 6)] }, '2026-08-29'),
      ).toBeUndefined()
    })

    it('disqualifies nothing, and reads no mechanism to decide it', () => {
      const baseline = { ...emptyRecord, puffSessions: [kickedSession('2026-08-26')] }
      // §2 makes a Logical Day Known if it carries any Puff Session, so the
      // Unknown-day exclusion `Longest Gap` needs is vacuous here rather than
      // omitted. And the window is uniform across the conversion: a Baseline
      // day counts like any other, so nothing observable happens on the day a
      // Ratchet Step first gives the record a Target — or on the day it reaches
      // zero.
      const underTarget = { ...baseline, ratchetSteps: [ratchetStep('2026-08-27', 10)] }
      const atZero = { ...baseline, ratchetSteps: [ratchetStep('2026-08-27', 0)] }

      expect(kicksMarked(baseline, '2026-08-29')).toBe(1)
      expect(kicksMarked(underTarget, '2026-08-29')).toBe(1)
      expect(kicksMarked(atZero, '2026-08-29')).toBe(1)
    })

    it('reads its window off the one definition the Dial is drawn from', () => {
      // "The same window as the Dial" is a rule, so the two share a predicate
      // rather than each shifting by their own 14. Divergence between the
      // picture and the figure beneath it would otherwise be silent.
      expect(DIAL_WINDOW_DAYS).toBe(14)
      expect(isInDialWindow('2026-08-29', '2026-08-29')).toBe(true) // today, still running
      expect(isInDialWindow('2026-08-16', '2026-08-29')).toBe(true) // the oldest day drawn
      expect(isInDialWindow('2026-08-15', '2026-08-29')).toBe(false) // one day past the edge
      expect(isInDialWindow('2026-08-30', '2026-08-29')).toBe(false) // ahead of the clock
    })
  })

  it('reads the same figures whether or not the Puff Sessions are Kicked', () => {
    const record: DayLedgerRecord = {
      puffSessions: [
        puffSession('2026-08-25', 12),
        puffSession('2026-08-26', 9),
        puffSession('2026-08-27', 8),
      ],
      resistedUrges: [],
      clearDays: [],
      ratchetSteps: [ratchetStep('2026-08-24', 12), ratchetStep('2026-08-26', 10)],
    }
    // The Kick touches no mechanism, so every reading has to be blind to it.
    const kicked: DayLedgerRecord = {
      ...record,
      puffSessions: record.puffSessions.map((session) => ({
        ...session,
        kickMarkedAt: `${session.logicalDay}T12:05:00.000Z`,
      })),
    }
    const today = '2026-08-27'
    const now = new Date('2026-08-27T18:00:00.000Z')

    expect(pace(record, now, 'UTC')).toBeDefined()
    expect(pace(kicked, now, 'UTC')).toEqual(pace(record, now, 'UTC'))
    expect(spacing(record, now, 'UTC')).toBeDefined()
    expect(spacing(kicked, now, 'UTC')).toEqual(spacing(record, now, 'UTC'))
    expect(momentum(kicked, today)).toBe(momentum(record, today))
    expect(stepsRemaining(kicked, today)).toEqual(stepsRemaining(record, today))
    expect(stepCadence(kicked)).toBe(stepCadence(record))
    expect(quitHorizon(kicked, today)).toEqual(quitHorizon(record, today))
    expect(longestGap(kicked, now, today)).toEqual(longestGap(record, now, today))
    expect(dayTotal(kicked, today)).toBe(dayTotal(record, today))
    expect(isMet(kicked, '2026-08-26', today)).toBe(isMet(record, '2026-08-26', today))
  })
})
