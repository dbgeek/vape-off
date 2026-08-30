import type { LogicalDayKey, PuffSession, ResistedUrge } from '../store/records.ts'
import type { DayLedgerRecord } from './day-ledger.ts'
import { stampEvent } from './logical-day.ts'

/**
 * Corrections: what changing the record after the fact does to it.
 *
 * A Correction is described once and applied twice — to a copy of the record,
 * to show what it would do to Momentum before it is made, and to the database,
 * to make it. Both go through the rules stated here, so the number the
 * confirmation names is the number the write produces (ADR 0011).
 *
 * Declaring a Clear Day is not a Correction: it asserts something about a day
 * the record has nothing on, rather than changing what the record already says.
 */

export type Correction =
  | { kind: 'add-puff-session'; at: Date; count: number }
  | { kind: 'add-resisted-urge'; at: Date }
  | { kind: 'update-puff-session'; id: string; at: Date; count: number }
  | { kind: 'update-resisted-urge'; id: string; at: Date }
  | { kind: 'delete-puff-session'; id: string }
  | { kind: 'delete-resisted-urge'; id: string }

export type CorrectionRefusal = 'count-below-one' | 'in-the-future'

export type CorrectedRecord =
  | { status: 'corrected'; record: DayLedgerRecord }
  | { status: 'refused'; reason: CorrectionRefusal }

/**
 * The id carried by the Puff Session or Resisted Urge an unapplied Correction
 * would add. Nothing reads it: the store assigns the real one when the
 * Correction is written.
 */
export const UNWRITTEN_ID = 'unwritten-correction'

/**
 * Why the record cannot hold this Correction, if it cannot.
 *
 * `now` bounds what counts as the future. A caller without a clock — the store,
 * which is told the instant rather than reading one — omits it and is checked
 * on everything else.
 */
export function correctionRefusal(
  correction: Correction,
  now?: Date,
): CorrectionRefusal | undefined {
  if ('count' in correction && (!Number.isInteger(correction.count) || correction.count < 1)) {
    return 'count-below-one'
  }
  if (now !== undefined && 'at' in correction && correction.at.getTime() > now.getTime()) {
    return 'in-the-future'
  }
  return undefined
}

/**
 * Whether this Correction drops the Clear Day on the Logical Day it lands in.
 * A Puff Session written into a Clear Day drops the mark; a Resisted Urge does
 * not, since a day carrying nothing but Resisted Urges is still Clear.
 */
export function dropsClearDay(correction: Correction): boolean {
  return correction.kind === 'add-puff-session' || correction.kind === 'update-puff-session'
}

function withoutClearDay(
  record: DayLedgerRecord,
  logicalDay: LogicalDayKey,
): DayLedgerRecord['clearDays'] {
  return record.clearDays.filter((day) => day.logicalDay !== logicalDay)
}

export function applyCorrection(
  record: DayLedgerRecord,
  correction: Correction,
  now: Date,
  timeZone: string,
): CorrectedRecord {
  const refusal = correctionRefusal(correction, now)
  if (refusal !== undefined) return { status: 'refused', reason: refusal }

  switch (correction.kind) {
    case 'add-puff-session': {
      const stamp = stampEvent(correction.at, timeZone)
      const added: PuffSession = {
        id: UNWRITTEN_ID,
        ...stamp,
        lastTapAt: stamp.at,
        count: correction.count,
      }
      return {
        status: 'corrected',
        record: {
          ...record,
          puffSessions: [...record.puffSessions, added],
          clearDays: withoutClearDay(record, stamp.logicalDay),
        },
      }
    }

    case 'add-resisted-urge': {
      const added: ResistedUrge = { id: UNWRITTEN_ID, ...stampEvent(correction.at, timeZone) }
      return {
        status: 'corrected',
        record: { ...record, resistedUrges: [...record.resistedUrges, added] },
      }
    }

    case 'update-puff-session': {
      const stamp = stampEvent(correction.at, timeZone)
      return {
        status: 'corrected',
        record: {
          ...record,
          puffSessions: record.puffSessions.map((session) =>
            session.id === correction.id
              ? { ...session, ...stamp, count: correction.count }
              : session,
          ),
          clearDays: withoutClearDay(record, stamp.logicalDay),
        },
      }
    }

    case 'update-resisted-urge': {
      const stamp = stampEvent(correction.at, timeZone)
      return {
        status: 'corrected',
        record: {
          ...record,
          resistedUrges: record.resistedUrges.map((urge) =>
            urge.id === correction.id ? { ...urge, ...stamp } : urge,
          ),
        },
      }
    }

    case 'delete-puff-session':
      return {
        status: 'corrected',
        record: {
          ...record,
          puffSessions: record.puffSessions.filter((session) => session.id !== correction.id),
        },
      }

    case 'delete-resisted-urge':
      return {
        status: 'corrected',
        record: {
          ...record,
          resistedUrges: record.resistedUrges.filter((urge) => urge.id !== correction.id),
        },
      }
  }
}
