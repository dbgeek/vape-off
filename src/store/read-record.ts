import type { DayLedgerRecord } from '../domain/day-ledger.ts'
import type { VapeOffDatabase } from './database.ts'

/**
 * The whole record in one read, shared by the session and by the Ratchet, which
 * has to make the same read inside its own transaction.
 *
 * It sits below the session rather than inside it because the session imports
 * the Ratchet's `evaluate`: holding the read here is what keeps the two modules
 * from importing each other.
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
