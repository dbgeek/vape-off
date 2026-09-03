import type { DayLedgerRecord } from '../domain/day-ledger.ts'
import { getMeta, setMeta } from '../store/meta.ts'
import { declareStepBack } from '../store/ratchet-writes.ts'
import { browserSession, type StoreSession } from '../store/session.ts'
import type { StatsSnapshot, StatsSource } from './StatsScreen.tsx'

export function createBrowserStatsSource(session: StoreSession): StatsSource {
  const { environment } = session

  /** Stats' own extras, hung on a record the session has already read. */
  async function snapshotOf(record: DayLedgerRecord): Promise<StatsSnapshot> {
    const db = await session.database()
    const [exports, dismissedAt] = await Promise.all([
      db.exports.toArray(),
      getMeta(db, 'lastBackupNagDismissedAt'),
    ])
    return {
      record,
      exports,
      backupCardDismissedAt: typeof dismissedAt === 'number' ? dismissedAt : 0,
    }
  }

  return {
    async load() {
      await session.evaluate()
      return snapshotOf(await session.readRecord())
    },
    async dismissBackupCard(uncoveredKnownDays) {
      await setMeta(await session.database(), 'lastBackupNagDismissedAt', uncoveredKnownDays)
    },
    // A Declared Step is the one write that sets the Target by hand, so it is
    // the last one that should leave the Ratchet's other decisions a beat behind.
    async declareStepBack() {
      const { record } = await session.write((db) => declareStepBack(db, environment))
      return snapshotOf(record)
    },
  }
}

export const browserStatsSource = createBrowserStatsSource(browserSession)
