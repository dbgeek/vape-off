import { describe, expect, it } from 'vitest'
import type { DayLedgerRecord } from '../domain/day-ledger.ts'
import type { ClearDay, PuffSession, RatchetStep, ResistedUrge } from '../store/records.ts'
import { buildTrackView } from './track-view.ts'

const emptyRecord: DayLedgerRecord = {
  puffSessions: [],
  resistedUrges: [],
  clearDays: [],
  ratchetSteps: [],
}

function session(
  id: string,
  logicalDay: string,
  at: string,
  count: number,
  lastTapAt = at,
): PuffSession {
  return { id, logicalDay, at, lastTapAt, count, tz: 'UTC' }
}

function urge(id: string, logicalDay: string, at: string): ResistedUrge {
  return { id, logicalDay, at, tz: 'UTC' }
}

function clearDay(logicalDay: string): ClearDay {
  return { logicalDay, at: `${logicalDay}T12:00:00.000Z`, tz: 'UTC' }
}

function step(
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

describe('the Track view', () => {
  it('carries today alone, in the order it happened, with the Target in force', () => {
    const record = {
      ...emptyRecord,
      puffSessions: [
        session('later', '2026-08-29', '2026-08-29T19:00:00.000Z', 2),
        session('earlier', '2026-08-29', '2026-08-29T10:00:00.000Z', 7),
        session('yesterday', '2026-08-28', '2026-08-28T10:00:00.000Z', 100),
      ],
      resistedUrges: [
        urge('today', '2026-08-29', '2026-08-29T14:00:00.000Z'),
        urge('yesterday', '2026-08-28', '2026-08-28T14:00:00.000Z'),
      ],
      ratchetSteps: [step('2026-08-20', 24)],
    }

    const view = buildTrackView(record, new Date('2026-08-29T19:02:00.000Z'), 'UTC')

    expect(view.today).toBe('2026-08-29')
    expect(view.puffSessions.map((item) => item.id)).toEqual(['earlier', 'later'])
    expect(view.resistedUrges.map((item) => item.id)).toEqual(['today'])
    expect(view.total).toBe(9)
    expect(view.target).toBe(24)
    expect(view.hasHistory).toBe(true)
  })

  it('leaves the Target absent during the Baseline', () => {
    const record = {
      ...emptyRecord,
      puffSessions: [session('only', '2026-08-29', '2026-08-29T10:00:00.000Z', 3)],
    }

    const view = buildTrackView(record, new Date('2026-08-29T12:00:00.000Z'), 'UTC')

    expect(view.target).toBeUndefined()
    expect(view.total).toBe(3)
    expect(view.targetReached).toBeUndefined()
    expect(view.overTargetSessionIds.size).toBe(0)
  })

  it('names the Puff Session that reached the Target and marks only the ones after it', () => {
    const record = {
      ...emptyRecord,
      puffSessions: [
        session('first', '2026-08-29', '2026-08-29T10:00:00.000Z', 2),
        session('reached', '2026-08-29', '2026-08-29T19:04:00.000Z', 2),
        session('later', '2026-08-29', '2026-08-29T20:00:00.000Z', 1),
      ],
      ratchetSteps: [step('2026-08-20', 4)],
    }

    const view = buildTrackView(record, new Date('2026-08-29T21:00:00.000Z'), 'UTC')

    expect(view.targetReached?.id).toBe('reached')
    expect(view.overTargetSessionIds).toEqual(new Set(['later']))
  })

  it('puts every Puff Session past Target 0 without inventing a moment it was reached', () => {
    const record = {
      ...emptyRecord,
      puffSessions: [
        session('first', '2026-08-29', '2026-08-29T10:00:00.000Z', 1),
        session('second', '2026-08-29', '2026-08-29T20:00:00.000Z', 1),
      ],
      ratchetSteps: [step('2026-08-20', 0, 'declared')],
    }

    const view = buildTrackView(record, new Date('2026-08-29T21:00:00.000Z'), 'UTC')

    expect(view.targetReached).toBeUndefined()
    expect(view.overTargetSessionIds).toEqual(new Set(['first', 'second']))
  })

  it('carries the Puff Session whose Merge Window is still open', () => {
    const record = {
      ...emptyRecord,
      puffSessions: [
        session('earlier', '2026-08-29', '2026-08-29T10:00:00.000Z', 1),
        session('open', '2026-08-29', '2026-08-29T19:00:00.000Z', 2, '2026-08-29T19:01:00.000Z'),
      ],
    }

    const open = buildTrackView(record, new Date('2026-08-29T19:02:00.000Z'), 'UTC')
    const closed = buildTrackView(record, new Date('2026-08-29T19:05:00.000Z'), 'UTC')

    expect(open.openSession?.id).toBe('open')
    expect(closed.openSession).toBeUndefined()
  })

  it('keeps only the Pace slots still ahead, and none during the Baseline', () => {
    const record = {
      ...emptyRecord,
      puffSessions: [session('morning', '2026-08-29', '2026-08-29T10:00:00.000Z', 2)],
      ratchetSteps: [step('2026-08-20', 6)],
    }
    const now = new Date('2026-08-29T12:00:00.000Z')

    const view = buildTrackView(record, now, 'UTC')

    expect(view.paceSlots.length).toBeGreaterThan(0)
    expect(
      view.paceSlots.every((slot) => Date.parse(slot) > now.getTime()),
    ).toBe(true)

    const baseline = buildTrackView(
      { ...record, ratchetSteps: [] },
      now,
      'UTC',
    )

    expect(baseline.paceSlots).toEqual([])
  })

  it('offers the seven most recent Unknown Logical Days for catch-up', () => {
    const record = {
      ...emptyRecord,
      resistedUrges: [urge('old', '2026-08-14', '2026-08-14T12:00:00.000Z')],
    }

    const view = buildTrackView(record, new Date('2026-08-29T12:00:00.000Z'), 'UTC')

    expect(view.catchUpDays).toEqual([
      '2026-08-22',
      '2026-08-23',
      '2026-08-24',
      '2026-08-25',
      '2026-08-26',
      '2026-08-27',
      '2026-08-28',
    ])
  })

  it('leaves out the Known Logical Days inside the catch-up window', () => {
    const record = {
      ...emptyRecord,
      resistedUrges: [urge('old', '2026-08-14', '2026-08-14T12:00:00.000Z')],
      clearDays: [clearDay('2026-08-24'), clearDay('2026-08-27')],
    }

    const view = buildTrackView(record, new Date('2026-08-29T12:00:00.000Z'), 'UTC')

    expect(view.catchUpDays).not.toContain('2026-08-24')
    expect(view.catchUpDays).not.toContain('2026-08-27')
    expect(view.catchUpDays).toHaveLength(5)
  })

  it('never offers a day before the record has any evidence', () => {
    const record = {
      ...emptyRecord,
      puffSessions: [session('first', '2026-08-27', '2026-08-27T10:00:00.000Z', 1)],
    }

    const view = buildTrackView(record, new Date('2026-08-29T12:00:00.000Z'), 'UTC')

    expect(view.catchUpDays).toEqual(['2026-08-28'])
  })

  it('offers nothing to a record with no history at all', () => {
    const view = buildTrackView(emptyRecord, new Date('2026-08-29T12:00:00.000Z'), 'UTC')

    expect(view.hasHistory).toBe(false)
    expect(view.catchUpDays).toEqual([])
  })

  it('treats a Ratchet Step as evidence when its events are gone', () => {
    const record = { ...emptyRecord, ratchetSteps: [step('2026-08-26', 4)] }

    const view = buildTrackView(record, new Date('2026-08-29T12:00:00.000Z'), 'UTC')

    expect(view.hasHistory).toBe(true)
    expect(view.catchUpDays).toEqual(['2026-08-26', '2026-08-27', '2026-08-28'])
  })

  it('takes the earliest evidence from the events rather than the Ratchet Step when both exist', () => {
    const record = {
      ...emptyRecord,
      clearDays: [clearDay('2026-08-23')],
      ratchetSteps: [step('2026-08-27', 4)],
    }

    const view = buildTrackView(record, new Date('2026-08-29T12:00:00.000Z'), 'UTC')

    expect(view.catchUpDays).toEqual([
      '2026-08-24',
      '2026-08-25',
      '2026-08-26',
      '2026-08-27',
      '2026-08-28',
    ])
  })

  it('knows when today has been declared Clear', () => {
    const record = { ...emptyRecord, clearDays: [clearDay('2026-08-29')] }

    const view = buildTrackView(record, new Date('2026-08-29T12:00:00.000Z'), 'UTC')

    expect(view.todayIsClear).toBe(true)
    expect(buildTrackView(emptyRecord, new Date('2026-08-29T12:00:00.000Z'), 'UTC').todayIsClear).toBe(false)
  })

  it('offers the handover once Target 1 has been held', () => {
    const held = {
      ...emptyRecord,
      clearDays: ['22', '23', '24', '25', '26'].map((day) => clearDay(`2026-08-${day}`)),
      ratchetSteps: [step('2026-08-20', 1)],
    }

    expect(buildTrackView(held, new Date('2026-08-29T12:00:00.000Z'), 'UTC').handoverAvailable).toBe(true)
  })

  it('withholds the handover below five Met days and above Target 1', () => {
    const clearDays = ['22', '23', '24', '25'].map((day) => clearDay(`2026-08-${day}`))
    const now = new Date('2026-08-29T12:00:00.000Z')

    const notYet = { ...emptyRecord, clearDays, ratchetSteps: [step('2026-08-20', 1)] }
    const higherTarget = {
      ...emptyRecord,
      clearDays: [...clearDays, clearDay('2026-08-26')],
      ratchetSteps: [step('2026-08-20', 2)],
    }

    expect(buildTrackView(notYet, now, 'UTC').handoverAvailable).toBe(false)
    expect(buildTrackView(higherTarget, now, 'UTC').handoverAvailable).toBe(false)
  })

  it('measures the handover window against the latest Ratchet Step', () => {
    const record = {
      ...emptyRecord,
      clearDays: ['22', '23', '24', '25', '26'].map((day) => clearDay(`2026-08-${day}`)),
      ratchetSteps: [step('2026-08-20', 2), step('2026-08-26', 1)],
    }

    expect(buildTrackView(record, new Date('2026-08-29T12:00:00.000Z'), 'UTC').handoverAvailable).toBe(false)
  })

  it('reads the Logical Day from the time zone it is given', () => {
    const record = {
      ...emptyRecord,
      puffSessions: [session('late', '2026-08-29', '2026-08-30T01:00:00.000Z', 1)],
    }

    const view = buildTrackView(record, new Date('2026-08-30T02:00:00.000Z'), 'UTC')

    expect(view.today).toBe('2026-08-29')
    expect(view.puffSessions.map((item) => item.id)).toEqual(['late'])
  })
})
