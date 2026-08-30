import {
  correctionRefusal,
  dropsClearDay,
  type Correction,
  type CorrectionRefusal,
} from '../domain/corrections.ts'
import { instantOf, stampEvent } from '../domain/logical-day.ts'
import type { VapeOffDatabase } from './database.ts'
import type { ClearDay, PuffSession, ResistedUrge } from './records.ts'
import type { WriteEnvironment } from './session.ts'

/**
 * Writing a Correction into the record. What a Correction *does* is decided in
 * `domain/corrections.ts`, so the preview the reader was shown and the write
 * they confirmed cannot disagree; what is here is the Dexie half of it.
 *
 * The store is told the instant rather than reading a clock, so it cannot judge
 * whether a Correction lands in the future — that check belongs to the caller
 * holding the clock. Everything else it refuses for itself.
 */

const REFUSALS: Record<CorrectionRefusal, string> = {
  'count-below-one': 'A Puff Session count must be a positive integer',
  'in-the-future': 'A Correction cannot land in the future',
}

function refuseIfUnholdable(correction: Correction): void {
  const refusal = correctionRefusal(correction)
  if (refusal !== undefined) throw new RangeError(REFUSALS[refusal])
}

export async function writePuffSession(
  db: VapeOffDatabase,
  correction: Extract<Correction, { kind: 'add-puff-session' }>,
  environment: WriteEnvironment,
): Promise<PuffSession> {
  refuseIfUnholdable(correction)

  const timeZone = environment.timeZone()
  const stamp = stampEvent(correction.at, timeZone)
  const record: PuffSession = {
    id: environment.randomUUID(),
    ...stamp,
    lastTapAt: stamp.at,
    count: correction.count,
  }

  await db.transaction('rw', db.puffSessions, db.clearDays, async () => {
    await db.puffSessions.add(record)
    if (dropsClearDay(correction)) await db.clearDays.delete(record.logicalDay)
  })
  return record
}

export async function writeResistedUrge(
  db: VapeOffDatabase,
  at: Date,
  environment: WriteEnvironment,
): Promise<ResistedUrge> {
  const record: ResistedUrge = {
    id: environment.randomUUID(),
    ...stampEvent(at, environment.timeZone()),
  }
  await db.resistedUrges.add(record)
  return record
}

export async function writeClearDay(
  db: VapeOffDatabase,
  at: Date,
  environment: WriteEnvironment,
): Promise<ClearDay | undefined> {
  const record = stampEvent(at, environment.timeZone())
  return db.transaction('rw', db.puffSessions, db.clearDays, async () => {
    const hasPuffSession =
      (await db.puffSessions.where('logicalDay').equals(record.logicalDay).count()) > 0
    if (hasPuffSession) return undefined
    await db.clearDays.put(record)
    return record
  })
}

export async function updatePuffSession(
  db: VapeOffDatabase,
  correction: Extract<Correction, { kind: 'update-puff-session' }>,
  environment: WriteEnvironment,
): Promise<PuffSession> {
  refuseIfUnholdable(correction)

  return db.transaction('rw', db.puffSessions, db.clearDays, async () => {
    const existing = await db.puffSessions.get(correction.id)
    if (!existing) throw new Error('Puff Session not found')

    const timeZone = environment.timeZone()
    // The pickup keeps its length: the last tap moves with the first.
    const shift = correction.at.getTime() - Date.parse(existing.at)
    const edited: PuffSession = {
      ...existing,
      ...stampEvent(correction.at, timeZone),
      lastTapAt: instantOf(new Date(Date.parse(existing.lastTapAt) + shift), timeZone),
      count: correction.count,
    }
    await db.puffSessions.put(edited)
    if (dropsClearDay(correction)) await db.clearDays.delete(edited.logicalDay)
    return edited
  })
}

export async function deletePuffSession(db: VapeOffDatabase, id: string): Promise<void> {
  await db.puffSessions.delete(id)
}

export async function updateResistedUrge(
  db: VapeOffDatabase,
  id: string,
  at: Date,
  environment: WriteEnvironment,
): Promise<ResistedUrge> {
  const existing = await db.resistedUrges.get(id)
  if (!existing) throw new Error('Resisted Urge not found')
  const edited = { id, ...stampEvent(at, environment.timeZone()) }
  await db.resistedUrges.put(edited)
  return edited
}

export async function deleteResistedUrge(
  db: VapeOffDatabase,
  id: string,
): Promise<void> {
  await db.resistedUrges.delete(id)
}
