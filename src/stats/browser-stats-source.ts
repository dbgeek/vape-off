import { getMeta, setMeta } from '../store/meta.ts'
import { declareStepBack } from '../store/ratchet-writes.ts'
import { browserSession, type StoreSession } from '../store/session.ts'
import type { StatsSnapshot, StatsSource } from './StatsScreen.tsx'

export function createBrowserStatsSource(session: StoreSession): StatsSource {
  const { db, environment } = session

  async function readSnapshot(): Promise<StatsSnapshot> {
    const [record, exports, dismissedAt] = await Promise.all([
      session.readRecord(),
      db.exports.toArray(),
      getMeta(db, 'lastBackupNagDismissedAt'),
    ])
    return {
      record,
      exports,
      backupCardDismissedAt: typeof dismissedAt === 'number' ? dismissedAt : 0,
    }
  }

  async function readFreshSnapshot(): Promise<StatsSnapshot> {
    const snapshot = await readSnapshot()
    await session.refreshBadge(snapshot.record, environment.now())
    return snapshot
  }

  return {
    async load() {
      await session.ensureOpen()
      await session.evaluate()
      return readFreshSnapshot()
    },
    async dismissBackupCard(uncoveredKnownDays) {
      await session.ensureOpen()
      await setMeta(db, 'lastBackupNagDismissedAt', uncoveredKnownDays)
    },
    async declareStepBack() {
      await session.ensureOpen()
      await declareStepBack(db, environment)
      return readFreshSnapshot()
    },
  }
}

export const browserStatsSource = createBrowserStatsSource(browserSession)
