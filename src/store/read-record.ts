import type { DayLedgerRecord } from '../domain/day-ledger.ts'
import type { VapeOffDatabase } from './database.ts'

/**
 * The whole record in one read.
 *
 * It sits below the session rather than inside it so that the Ratchet, which
 * has to read within its own transaction, and the session, which reads outside
 * one, are reading the same four tables the same way.
 */
export async function readRecord(db: VapeOffDatabase): Promise<DayLedgerRecord> {
  const [puffSessions, resistedUrges, clearDays, ratchetSteps] = await Promise.all([
    db.puffSessions.toArray(),
    db.resistedUrges.toArray(),
    db.clearDays.toArray(),
    db.ratchetSteps.toArray(),
  ])
  return { puffSessions, resistedUrges, clearDays, ratchetSteps }
}
