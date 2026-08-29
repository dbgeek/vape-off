import type { DayLedgerRecord } from '../domain/day-ledger.ts'
import { updateBadge, type BadgeController } from '../shell/badge.ts'
import { VapeOffDatabase } from '../store/database.ts'
import { getMeta, setMeta } from '../store/meta.ts'
import { openDatabase } from '../store/open-database.ts'
import { declareStepBack, evaluate } from '../store/ratchet-writes.ts'
import type { StatsSnapshot, StatsSource } from './StatsScreen.tsx'

export interface BrowserStatsEnvironment {
  now: () => Date
  timeZone: () => string
  randomUUID: () => string
  badge: BadgeController
}

const browserEnvironment: BrowserStatsEnvironment = {
  now: () => new Date(),
  timeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  randomUUID: () => crypto.randomUUID(),
  badge: navigator,
}

async function readRecord(db: VapeOffDatabase): Promise<DayLedgerRecord> {
  const [puffSessions, resistedUrges, clearDays, ratchetSteps] = await Promise.all([
    db.puffSessions.toArray(),
    db.resistedUrges.toArray(),
    db.clearDays.toArray(),
    db.ratchetSteps.toArray(),
  ])
  return { puffSessions, resistedUrges, clearDays, ratchetSteps }
}

export function createBrowserStatsSource(
  db: VapeOffDatabase,
  environment: BrowserStatsEnvironment = browserEnvironment,
): StatsSource {
  let opening: Promise<void> | undefined

  async function ensureOpen(): Promise<void> {
    if (db.isOpen()) return
    opening ??= openDatabase(db, environment.randomUUID).then((result) => {
      if (result.status !== 'ok') throw new Error(`Database is ${result.status}`)
    })
    await opening
  }

  async function readSnapshot(): Promise<StatsSnapshot> {
    const [record, exports, dismissedAt] = await Promise.all([
      readRecord(db),
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
    try {
      await updateBadge(
        snapshot.record,
        environment.now(),
        environment.timeZone(),
        environment.badge,
      )
    } catch {
      // Badging is best-effort; Stats readings and the record remain available.
    }
    return snapshot
  }

  return {
    async load() {
      await ensureOpen()
      await evaluate(db, environment)
      return readFreshSnapshot()
    },
    async dismissBackupCard(uncoveredKnownDays) {
      await ensureOpen()
      await setMeta(db, 'lastBackupNagDismissedAt', uncoveredKnownDays)
    },
    async declareStepBack() {
      await ensureOpen()
      await declareStepBack(db, environment)
      return readFreshSnapshot()
    },
  }
}

export const browserStatsSource = createBrowserStatsSource(new VapeOffDatabase())
