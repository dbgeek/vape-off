import type { DayLedgerRecord } from '../domain/day-ledger.ts'
import { deviceTimeZone } from '../domain/logical-day.ts'
import { updateBadge, type BadgeController } from '../shell/badge.ts'
import type { VapeOffDatabase } from '../store/database.ts'
import { browserDatabase } from '../store/browser-database.ts'
import {
  deletePuffSession,
  deleteResistedUrge,
  updatePuffSession,
  updateResistedUrge,
  writeClearDay,
  writePuffSession,
  writeResistedUrge,
} from '../store/event-writes.ts'
import { getMeta, setMeta } from '../store/meta.ts'
import { openDatabase } from '../store/open-database.ts'
import { declareHandover, evaluate } from '../store/ratchet-writes.ts'
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
  timeZone: () => deviceTimeZone(),
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

  async function refresh(at: Date): Promise<DayLedgerRecord> {
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

  async function refreshAfterWrite(at: Date): Promise<DayLedgerRecord> {
    await setMeta(db, 'firstRunCardDismissed', true)
    return refresh(at)
  }

  return {
    async load() {
      await ensureOpen()
      return refresh(environment.now())
    },
    async loadFirstRunCardDismissed() {
      await ensureOpen()
      return (await getMeta(db, 'firstRunCardDismissed')) ?? false
    },
    async logPuff(at) {
      await ensureOpen()
      await logPuff(db, at, environment)
      return refreshAfterWrite(at)
    },
    async logResistedUrge(at) {
      await ensureOpen()
      await writeResistedUrge(db, at, environment)
      return refreshAfterWrite(at)
    },
    async dismissFirstRunCard() {
      await ensureOpen()
      await setMeta(db, 'firstRunCardDismissed', true)
    },
    async declareClearDay(at) {
      await ensureOpen()
      await writeClearDay(db, at, environment)
      return refreshAfterWrite(environment.now())
    },
    async addPuffSession(input) {
      await ensureOpen()
      await writePuffSession(
        db,
        { at: input.at, lastTapAt: input.at, count: input.count },
        environment,
      )
      return refreshAfterWrite(environment.now())
    },
    async addResistedUrge(at) {
      await ensureOpen()
      await writeResistedUrge(db, at, environment)
      return refreshAfterWrite(environment.now())
    },
    async updatePuffSession(id, input) {
      await ensureOpen()
      await updatePuffSession(db, id, input, environment)
      return refreshAfterWrite(environment.now())
    },
    async deletePuffSession(id) {
      await ensureOpen()
      await deletePuffSession(db, id)
      return refreshAfterWrite(environment.now())
    },
    async updateResistedUrge(id, at) {
      await ensureOpen()
      await updateResistedUrge(db, id, at, environment)
      return refreshAfterWrite(environment.now())
    },
    async deleteResistedUrge(id) {
      await ensureOpen()
      await deleteResistedUrge(db, id)
      return refreshAfterWrite(environment.now())
    },
    async declareHandover() {
      await ensureOpen()
      await declareHandover(db, environment)
      return refreshAfterWrite(environment.now())
    },
  }
}

export const browserTrackSource = createBrowserTrackSource(browserDatabase)
