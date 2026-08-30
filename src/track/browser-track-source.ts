import type { Correction } from '../domain/corrections.ts'
import type { DayLedgerRecord } from '../domain/day-ledger.ts'
import { writeCorrection } from '../store/correction-writes.ts'
import { getMeta, setMeta } from '../store/meta.ts'
import { declareHandover } from '../store/ratchet-writes.ts'
import { browserSession, type StoreSession } from '../store/session.ts'
import { logPuff, logResistedUrge, writeClearDay } from '../store/track-writes.ts'
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
    // A live tap and an added Resisted Urge write the same record, and are not
    // the same act: one happens now, the other says something about the past.
    async logResistedUrge(at) {
      await session.ensureOpen()
      await logResistedUrge(db, at, environment)
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
    // The Correction crosses whole. The clock is the session's, so a Correction
    // landing in the future is refused here rather than by whoever remembers to.
    async correct(correction: Correction) {
      await session.ensureOpen()
      const written = await writeCorrection(db, correction, environment)
      if (written.status === 'refused') return written
      return { status: 'corrected', record: await refreshAfterWrite(environment.now()) }
    },
    async declareHandover() {
      await session.ensureOpen()
      await declareHandover(db, environment)
      return refreshAfterWrite(environment.now())
    },
  }
}

export const browserTrackSource = createBrowserTrackSource(browserSession)
