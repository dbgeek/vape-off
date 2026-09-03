import type { Correction } from '../domain/corrections.ts'
import type { DayLedgerRecord } from '../domain/day-ledger.ts'
import { writeCorrection } from '../store/correction-writes.ts'
import type { VapeOffDatabase } from '../store/database.ts'
import { getMeta, setMeta } from '../store/meta.ts'
import { declareHandover } from '../store/ratchet-writes.ts'
import { browserSession, type StoreSession } from '../store/session.ts'
import { logPuff, logResistedUrge, toggleKick, writeClearDay } from '../store/track-writes.ts'
import type { TrackSource } from './TrackScreen.tsx'

export function createBrowserTrackSource(session: StoreSession): TrackSource {
  const { environment } = session

  /**
   * A Track write, and the greeting it claims on the way past.
   *
   * The claim rides **inside** the write rather than beside it, so a write that
   * put something in the record cannot leave the greeting still offering to
   * start one. Stated here once: it is Track's rule and no other slice has it,
   * and a flag at each call site would be the same sentence written six times.
   *
   * `toggleKick` is the one Track write that does not come through here.
   */
  async function trackWrite(
    operation: (db: VapeOffDatabase) => Promise<unknown>,
  ): Promise<DayLedgerRecord> {
    const { record } = await session.write(async (db) => {
      await operation(db)
      await setMeta(db, 'firstRunCardDismissed', true)
    })
    return record
  }

  return {
    async load() {
      await session.evaluate()
      return session.readRecord()
    },
    async loadFirstRunCardDismissed() {
      return (await getMeta(await session.database(), 'firstRunCardDismissed')) ?? false
    },
    logPuff(at) {
      return trackWrite((db) => logPuff(db, at, environment))
    },
    // A live tap and an added Resisted Urge write the same record, and are not
    // the same act: one happens now, the other says something about the past.
    logResistedUrge(at) {
      return trackWrite((db) => logResistedUrge(db, at, environment))
    },
    async dismissFirstRunCard() {
      await setMeta(await session.database(), 'firstRunCardDismissed', true)
    },
    declareClearDay(at) {
      return trackWrite((db) => writeClearDay(db, at, environment))
    },
    // The Correction crosses whole. The clock is the session's, so a Correction
    // landing in the future is refused here rather than by whoever remembers to.
    // A refused one wrote nothing, so it claims no greeting.
    async correct(correction: Correction) {
      const { result, record } = await session.write(async (db) => {
        const written = await writeCorrection(db, correction, environment)
        if (written.status === 'corrected') await setMeta(db, 'firstRunCardDismissed', true)
        return written
      })
      if (result.status === 'refused') return result
      return { status: 'corrected', record }
    },
    // Marking is a live write and not a log: a Kick can only ever land on a
    // Puff Session, which claimed the greeting when it was written. So this goes
    // through the session directly, without claiming the first write again.
    async toggleKick(id, at) {
      const { record } = await session.write((db) => toggleKick(db, id, at, environment))
      return record
    },
    declareHandover() {
      return trackWrite((db) => declareHandover(db, environment))
    },
  }
}

export const browserTrackSource = createBrowserTrackSource(browserSession)
