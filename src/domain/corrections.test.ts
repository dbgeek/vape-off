import { describe, expect, it } from 'vitest'
import type { ClearDay, PuffSession, RatchetStep, ResistedUrge } from '../store/records.ts'
import {
  applyCorrection,
  correctionRefusal,
  dropsClearDay,
  type Correction,
} from './corrections.ts'
import type { DayLedgerRecord } from './day-ledger.ts'
import { momentum } from './readouts.ts'

const emptyRecord: DayLedgerRecord = {
  puffSessions: [],
  resistedUrges: [],
  clearDays: [],
  ratchetSteps: [],
}

const now = new Date('2026-08-29T18:00:00.000Z')

function puffSession(id: string, logicalDay: string, count: number): PuffSession {
  const at = `${logicalDay}T12:00:00.000Z`
  return { id, at, lastTapAt: at, count, logicalDay, tz: 'UTC' }
}

function resistedUrge(id: string, logicalDay: string): ResistedUrge {
  return { id, at: `${logicalDay}T12:00:00.000Z`, logicalDay, tz: 'UTC' }
}

function clearDay(logicalDay: string): ClearDay {
  return { logicalDay, at: `${logicalDay}T20:00:00.000Z`, tz: 'UTC' }
}

function ratchetStep(effectiveFrom: string, target: number): RatchetStep {
  return {
    id: `step-${effectiveFrom}`,
    effectiveFrom,
    target,
    kind: 'earned',
    at: `${effectiveFrom}T04:00:00.000Z`,
  }
}

/** The corrected record, or a failure if the Correction was refused. */
function corrected(record: DayLedgerRecord, correction: Correction): DayLedgerRecord {
  const result = applyCorrection(record, correction, now, 'UTC')
  if (result.status !== 'corrected') throw new Error(`Refused: ${result.reason}`)
  return result.record
}

describe('Corrections', () => {
  describe('what the record can hold', () => {
    it.each([0, -1, 1.5, Number.NaN])('refuses a puff count of %s', (count) => {
      const correction: Correction = { kind: 'add-puff-session', at: now, count }

      expect(correctionRefusal(correction, now)).toBe('count-below-one')
      expect(applyCorrection(emptyRecord, correction, now, 'UTC')).toEqual({
        status: 'refused',
        reason: 'count-below-one',
      })
    })

    it('refuses a Correction that lands after the moment it is made', () => {
      const correction: Correction = {
        kind: 'add-resisted-urge',
        at: new Date('2026-08-29T18:00:01.000Z'),
      }

      expect(applyCorrection(emptyRecord, correction, now, 'UTC')).toEqual({
        status: 'refused',
        reason: 'in-the-future',
      })
    })

    it('checks everything but the future for a caller with no clock', () => {
      const ahead: Correction = { kind: 'add-puff-session', at: new Date('2099-01-01'), count: 2 }
      const unholdable: Correction = { kind: 'add-puff-session', at: now, count: 0 }

      expect(correctionRefusal(ahead)).toBeUndefined()
      expect(correctionRefusal(unholdable)).toBe('count-below-one')
    })

    it('has no count to refuse on a deletion or a Resisted Urge', () => {
      expect(correctionRefusal({ kind: 'delete-puff-session', id: 'a' }, now)).toBeUndefined()
      expect(correctionRefusal({ kind: 'add-resisted-urge', at: now }, now)).toBeUndefined()
    })
  })

  describe('the Clear Day a Correction drops', () => {
    it.each([
      [{ kind: 'add-puff-session', at: now, count: 1 }, true],
      [{ kind: 'update-puff-session', id: 'a', at: now, count: 1 }, true],
      [{ kind: 'add-resisted-urge', at: now }, false],
      [{ kind: 'update-resisted-urge', id: 'a', at: now }, false],
      [{ kind: 'delete-puff-session', id: 'a' }, false],
      [{ kind: 'delete-resisted-urge', id: 'a' }, false],
    ] as [Correction, boolean][])('$kind drops it: %s', (correction, drops) => {
      expect(dropsClearDay(correction)).toBe(drops)
    })

    it('drops the mark when a Puff Session is added to a Clear Day', () => {
      const record = { ...emptyRecord, clearDays: [clearDay('2026-08-28')] }

      const after = corrected(record, {
        kind: 'add-puff-session',
        at: new Date('2026-08-28T12:00:00.000Z'),
        count: 3,
      })

      expect(after.clearDays).toEqual([])
      expect(after.puffSessions).toHaveLength(1)
    })

    it('drops the mark at the Logical Day an edit moves a Puff Session into', () => {
      const record = {
        ...emptyRecord,
        puffSessions: [puffSession('moved', '2026-08-26', 3)],
        clearDays: [clearDay('2026-08-27'), clearDay('2026-08-28')],
      }

      const after = corrected(record, {
        kind: 'update-puff-session',
        id: 'moved',
        at: new Date('2026-08-28T12:00:00.000Z'),
        count: 3,
      })

      expect(after.clearDays).toEqual([clearDay('2026-08-27')])
      expect(after.puffSessions[0]).toMatchObject({ logicalDay: '2026-08-28', count: 3 })
    })

    it('leaves the mark standing for a Resisted Urge, which a Clear Day may carry', () => {
      const record = { ...emptyRecord, clearDays: [clearDay('2026-08-28')] }

      const after = corrected(record, {
        kind: 'add-resisted-urge',
        at: new Date('2026-08-28T12:00:00.000Z'),
      })

      expect(after.clearDays).toEqual([clearDay('2026-08-28')])
      expect(after.resistedUrges).toHaveLength(1)
    })
  })

  describe('what it leaves behind', () => {
    const record: DayLedgerRecord = {
      ...emptyRecord,
      puffSessions: [puffSession('kept', '2026-08-27', 2), puffSession('going', '2026-08-28', 5)],
      resistedUrges: [resistedUrge('urge', '2026-08-28')],
      ratchetSteps: [ratchetStep('2026-08-20', 4)],
    }

    it('removes only the Puff Session named, and never the Ratchet Steps', () => {
      const after = corrected(record, { kind: 'delete-puff-session', id: 'going' })

      expect(after.puffSessions.map((session) => session.id)).toEqual(['kept'])
      expect(after.resistedUrges).toEqual(record.resistedUrges)
      expect(after.ratchetSteps).toEqual(record.ratchetSteps)
    })

    it('removes only the Resisted Urge named', () => {
      const after = corrected(record, { kind: 'delete-resisted-urge', id: 'urge' })

      expect(after.resistedUrges).toEqual([])
      expect(after.puffSessions).toEqual(record.puffSessions)
    })

    it('re-stamps a Resisted Urge onto the Logical Day it is moved to', () => {
      const after = corrected(record, {
        kind: 'update-resisted-urge',
        id: 'urge',
        at: new Date('2026-08-26T09:00:00.000Z'),
      })

      expect(after.resistedUrges[0]).toMatchObject({ id: 'urge', logicalDay: '2026-08-26' })
    })

    it('never mutates the record it was given', () => {
      const before = structuredClone(record)

      corrected(record, { kind: 'delete-puff-session', id: 'going' })
      corrected(record, { kind: 'add-puff-session', at: now, count: 1 })

      expect(record).toEqual(before)
    })
  })

  describe('what the confirmation is measuring', () => {
    // ADR 0011: correcting the past moves the derived numbers, and the app has
    // to name the change rather than move the number silently. That promise only
    // holds if the record the preview measures is the one the write produces.
    it('names the Momentum a backfilled Puff Session costs', () => {
      const record: DayLedgerRecord = {
        ...emptyRecord,
        puffSessions: [
          puffSession('under', '2026-08-26', 2),
          puffSession('under-again', '2026-08-27', 2),
        ],
        ratchetSteps: [ratchetStep('2026-08-25', 4)],
      }
      const today = '2026-08-29'

      expect(momentum(record, today)).toBe(2)

      const after = corrected(record, {
        kind: 'add-puff-session',
        at: new Date('2026-08-27T09:00:00.000Z'),
        count: 9,
      })

      // The day stops being Met, so it stops adding a point and starts costing
      // one: a two-point swing from a single backfilled Puff Session.
      expect(momentum(after, today)).toBe(0)
    })

    it('makes a Clear Day declared over a forgotten Puff Session cost its point', () => {
      const record: DayLedgerRecord = {
        ...emptyRecord,
        clearDays: [clearDay('2026-08-27')],
        ratchetSteps: [ratchetStep('2026-08-25', 0)],
      }
      const today = '2026-08-29'

      expect(momentum(record, today)).toBe(1)

      const after = corrected(record, {
        kind: 'add-puff-session',
        at: new Date('2026-08-27T09:00:00.000Z'),
        count: 1,
      })

      // The Clear Day is dropped, so the day is Known but no longer Met at Target 0.
      expect(momentum(after, today)).toBe(0)
    })
  })

  it('re-times a Puff Session by moving the last tap with the first', () => {
    // The preview and the write share this rule, so the record the confirmation
    // is measured against is the record the write produces.
    const record: DayLedgerRecord = {
      ...emptyRecord,
      puffSessions: [
        {
          id: 'a-two-minute-pickup',
          at: '2026-08-29T12:00:00.000+00:00',
          lastTapAt: '2026-08-29T12:02:00.000+00:00',
          count: 2,
          logicalDay: '2026-08-29',
          tz: 'UTC',
        },
      ],
    }

    const corrected = applyCorrection(
      record,
      {
        kind: 'update-puff-session',
        id: 'a-two-minute-pickup',
        at: new Date('2026-08-29T15:00:00.000Z'),
        count: 4,
      },
      now,
      'UTC',
    )

    expect(corrected.status).toBe('corrected')
    expect(corrected.status === 'corrected' && corrected.record.puffSessions[0]).toMatchObject({
      at: '2026-08-29T15:00:00.000+00:00',
      lastTapAt: '2026-08-29T15:02:00.000+00:00',
      count: 4,
    })
  })
})
