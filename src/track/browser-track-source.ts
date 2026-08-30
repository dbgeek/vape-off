import type { DayLedgerRecord } from '../domain/day-ledger.ts'
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
import { declareHandover } from '../store/ratchet-writes.ts'
import { browserSession, type StoreSession } from '../store/session.ts'
import { logPuff } from '../store/track-writes.ts'
import type { TrackSource } from './TrackScreen.tsx'

export function createBrowserTrackSource(session: StoreSession): TrackSource {
  const { db, environment } = session

  async function refresh(at: Date): Promise<DayLedgerRecord> {
    await session.evaluate(at)
    const record = await session.readRecord()
    await session.refreshBadge(record, at)
    return record
  }

  async function refreshAfterWrite(at: Date): Promise<DayLedgerRecord> {
    await setMeta(db, 'firstRunCardDismissed', true)
    return refresh(at)
  }

  return {
    async load() {
      await session.ensureOpen()
      return refresh(environment.now())
    },
    async loadFirstRunCardDismissed() {
      await session.ensureOpen()
      return (await getMeta(db, 'firstRunCardDismissed')) ?? false
    },
    async logPuff(at) {
      await session.ensureOpen()
      await logPuff(db, at, environment)
      return refreshAfterWrite(at)
    },
    async logResistedUrge(at) {
      await session.ensureOpen()
      await writeResistedUrge(db, at, environment)
      return refreshAfterWrite(at)
    },
    async dismissFirstRunCard() {
      await session.ensureOpen()
      await setMeta(db, 'firstRunCardDismissed', true)
    },
    async declareClearDay(at) {
      await session.ensureOpen()
      await writeClearDay(db, at, environment)
      return refreshAfterWrite(environment.now())
    },
    async addPuffSession(input) {
      await session.ensureOpen()
      await writePuffSession(
        db,
        { kind: 'add-puff-session', at: input.at, count: input.count },
        environment,
      )
      return refreshAfterWrite(environment.now())
    },
    async addResistedUrge(at) {
      await session.ensureOpen()
      await writeResistedUrge(db, at, environment)
      return refreshAfterWrite(environment.now())
    },
    async updatePuffSession(id, input) {
      await session.ensureOpen()
      await updatePuffSession(
        db,
        { kind: 'update-puff-session', id, at: input.at, count: input.count },
        environment,
      )
      return refreshAfterWrite(environment.now())
    },
    async deletePuffSession(id) {
      await session.ensureOpen()
      await deletePuffSession(db, id)
      return refreshAfterWrite(environment.now())
    },
    async updateResistedUrge(id, at) {
      await session.ensureOpen()
      await updateResistedUrge(db, id, at, environment)
      return refreshAfterWrite(environment.now())
    },
    async deleteResistedUrge(id) {
      await session.ensureOpen()
      await deleteResistedUrge(db, id)
      return refreshAfterWrite(environment.now())
    },
    async declareHandover() {
      await session.ensureOpen()
      await declareHandover(db, environment)
      return refreshAfterWrite(environment.now())
    },
  }
}

export const browserTrackSource = createBrowserTrackSource(browserSession)
