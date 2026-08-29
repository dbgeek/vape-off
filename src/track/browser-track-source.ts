import type { DayLedgerRecord } from '../domain/day-ledger.ts'
import { updateBadge, type BadgeController } from '../shell/badge.ts'
import { VapeOffDatabase } from '../store/database.ts'
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

  async function refresh(at: Date, dismissCard: boolean): Promise<DayLedgerRecord> {
    await evaluate(db, {
      now: () => at,
      timeZone: environment.timeZone,
      randomUUID: environment.randomUUID,
    })
    if (dismissCard) await setMeta(db, 'firstRunCardDismissed', true)
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
      return refresh(environment.now(), false)
    },
    async loadFirstRunCardDismissed() {
      await ensureOpen()
      return (await getMeta(db, 'firstRunCardDismissed')) ?? false
    },
    async logPuff(at) {
      await ensureOpen()
      await logPuff(db, at, environment)
      return refresh(at, true)
    },
    async logResistedUrge(at) {
      await ensureOpen()
      await writeResistedUrge(db, at, environment)
      return refresh(at, true)
    },
    async dismissFirstRunCard() {
      await ensureOpen()
      await setMeta(db, 'firstRunCardDismissed', true)
    },
    async declareClearDay(at) {
      await ensureOpen()
      await writeClearDay(db, at, environment)
      return refresh(environment.now(), true)
    },
    async addPuffSession(input) {
      await ensureOpen()
      await writePuffSession(
        db,
        { at: input.at, lastTapAt: input.at, count: input.count },
        environment,
      )
      return refresh(environment.now(), true)
    },
    async addResistedUrge(at) {
      await ensureOpen()
      await writeResistedUrge(db, at, environment)
      return refresh(environment.now(), true)
    },
    async updatePuffSession(id, input) {
      await ensureOpen()
      await updatePuffSession(db, id, input, environment)
      return refresh(environment.now(), true)
    },
    async deletePuffSession(id) {
      await ensureOpen()
      await deletePuffSession(db, id)
      return refresh(environment.now(), true)
    },
    async updateResistedUrge(id, at) {
      await ensureOpen()
      await updateResistedUrge(db, id, at, environment)
      return refresh(environment.now(), true)
    },
    async deleteResistedUrge(id) {
      await ensureOpen()
      await deleteResistedUrge(db, id)
      return refresh(environment.now(), true)
    },
    async declareHandover() {
      await ensureOpen()
      await declareHandover(db, environment)
      return refresh(environment.now(), true)
    },
  }
}

export const browserTrackSource = createBrowserTrackSource(new VapeOffDatabase())
