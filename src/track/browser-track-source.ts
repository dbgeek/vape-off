import type { DayLedgerRecord } from '../domain/day-ledger.ts'
import { updateBadge, type BadgeController } from '../shell/badge.ts'
import { VapeOffDatabase } from '../store/database.ts'
import { writeResistedUrge } from '../store/event-writes.ts'
import { openDatabase } from '../store/open-database.ts'
import { evaluate } from '../store/ratchet-writes.ts'
import { logPuff } from '../store/track-writes.ts'
import type { TrackSource } from './TrackScreen.tsx'

export interface BrowserTrackEnvironment {
  now: () => Date
  timeZone: () => string
  randomUUID: () => string
  badge: BadgeController
}

const browserEnvironment: BrowserTrackEnvironment = {
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

export function createBrowserTrackSource(
  db: VapeOffDatabase,
  environment: BrowserTrackEnvironment = browserEnvironment,
): TrackSource {
  let opening: Promise<void> | undefined

  async function ensureOpen(): Promise<void> {
    if (db.isOpen()) return
    opening ??= openDatabase(db, environment.randomUUID).then((result) => {
      if (result.status !== 'ok') throw new Error(`Database is ${result.status}`)
    })
    await opening
  }

  async function afterWrite(at: Date): Promise<DayLedgerRecord> {
    await evaluate(db, {
      now: () => at,
      timeZone: environment.timeZone,
      randomUUID: environment.randomUUID,
    })
    const record = await readRecord(db)
    try {
      await updateBadge(record, at, environment.timeZone(), environment.badge)
    } catch {
      // Badging is a best-effort browser affordance; the record is already safe.
    }
    return record
  }

  return {
    async load() {
      await ensureOpen()
      return afterWrite(environment.now())
    },
    async logPuff(at) {
      await ensureOpen()
      await logPuff(db, at, environment)
      return afterWrite(at)
    },
    async logResistedUrge(at) {
      await ensureOpen()
      await writeResistedUrge(db, at, environment)
      return afterWrite(at)
    },
  }
}

export const browserTrackSource = createBrowserTrackSource(new VapeOffDatabase())
