import {
  correctionRefusal,
  dropsClearDay,
  retimedPuffSession,
  type Correction,
  type CorrectionRefusal,
} from '../domain/corrections.ts'
import { stampEvent } from '../domain/logical-day.ts'
import type { VapeOffDatabase } from './database.ts'
import type { PuffSession, ResistedUrge } from './records.ts'
import type { StoreEnvironment } from './session.ts'

/**
 * Writing a Correction into the record.
 *
 * A Correction crosses every seam whole: the reader is shown one, the store is
 * told the same one, and what it *does* is decided once in
 * `domain/corrections.ts`. So the preview and the write cannot disagree, and
 * nothing here takes a Correction apart to reassemble it (ADR 0011).
 *
 * Refusals come back as a reason rather than as prose. The store has no reader
 * to word them for, and a second wording of the same reason is how the
 * confirmation and the write drift apart.
 *
 * Live taps are not Corrections and are not written here — they live in
 * `track-writes.ts`, which is the other way the record changes.
 */

export type CorrectionWrite =
  | { status: 'corrected' }
  | { status: 'refused'; reason: CorrectionRefusal }

async function addPuffSession(
  db: VapeOffDatabase,
  correction: Extract<Correction, { kind: 'add-puff-session' }>,
  environment: StoreEnvironment,
): Promise<void> {
  const stamp = stampEvent(correction.at, environment.timeZone())
  const record: PuffSession = {
    id: environment.randomUUID(),
    ...stamp,
    lastTapAt: stamp.at,
    count: correction.count,
  }
  await db.puffSessions.add(record)
  if (dropsClearDay(correction)) await db.clearDays.delete(record.logicalDay)
}

async function addResistedUrge(
  db: VapeOffDatabase,
  correction: Extract<Correction, { kind: 'add-resisted-urge' }>,
  environment: StoreEnvironment,
): Promise<void> {
  const record: ResistedUrge = {
    id: environment.randomUUID(),
    ...stampEvent(correction.at, environment.timeZone()),
  }
  await db.resistedUrges.add(record)
}

async function updatePuffSession(
  db: VapeOffDatabase,
  correction: Extract<Correction, { kind: 'update-puff-session' }>,
  environment: StoreEnvironment,
): Promise<void> {
  const existing = await db.puffSessions.get(correction.id)
  if (!existing) throw new Error('Puff Session not found')

  const edited = retimedPuffSession(existing, correction, environment.timeZone())
  await db.puffSessions.put(edited)
  if (dropsClearDay(correction)) await db.clearDays.delete(edited.logicalDay)
}

async function updateResistedUrge(
  db: VapeOffDatabase,
  correction: Extract<Correction, { kind: 'update-resisted-urge' }>,
  environment: StoreEnvironment,
): Promise<void> {
  const existing = await db.resistedUrges.get(correction.id)
  if (!existing) throw new Error('Resisted Urge not found')
  await db.resistedUrges.put({
    id: correction.id,
    ...stampEvent(correction.at, environment.timeZone()),
  })
}

/** Applies the Correction, or says why the record cannot hold it. */
export async function writeCorrection(
  db: VapeOffDatabase,
  correction: Correction,
  environment: StoreEnvironment,
): Promise<CorrectionWrite> {
  const refusal = correctionRefusal(correction, environment.now())
  if (refusal !== undefined) return { status: 'refused', reason: refusal }

  await db.transaction('rw', db.puffSessions, db.resistedUrges, db.clearDays, async () => {
    switch (correction.kind) {
      case 'add-puff-session':
        return addPuffSession(db, correction, environment)
      case 'add-resisted-urge':
        return addResistedUrge(db, correction, environment)
      case 'update-puff-session':
        return updatePuffSession(db, correction, environment)
      case 'update-resisted-urge':
        return updateResistedUrge(db, correction, environment)
      case 'delete-puff-session':
        return db.puffSessions.delete(correction.id)
      case 'delete-resisted-urge':
        return db.resistedUrges.delete(correction.id)
    }
  })

  return { status: 'corrected' }
}
