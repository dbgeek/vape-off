import { instantOf, stampEvent } from '../domain/logical-day.ts'
import { openSessionAt } from '../domain/merge-window.ts'
import type { VapeOffDatabase } from './database.ts'
import type { ClearDay, PuffSession, ResistedUrge } from './records.ts'
import type { WriteEnvironment } from './session.ts'

/**
 * The live writes: what the Track screen puts in the record directly.
 *
 * Distinct from a Correction, which changes what the record already says and is
 * written in `correction-writes.ts`. Nothing here is proposed before it is made,
 * because none of it is deliberate about the past: a tap is a thing happening
 * now, and declaring a Clear Day or marking a Kick fills a silence the record
 * was keeping rather than changing an answer it already gave.
 */

export async function logPuff(
  db: VapeOffDatabase,
  at: Date,
  environment: WriteEnvironment,
): Promise<PuffSession> {
  const timeZone = environment.timeZone()

  return db.transaction('rw', db.puffSessions, db.clearDays, async () => {
    const openSession = openSessionAt(await db.puffSessions.toArray(), at, timeZone)

    if (openSession) {
      const merged = {
        ...openSession,
        lastTapAt: instantOf(at, timeZone),
        count: openSession.count + 1,
      }
      await db.puffSessions.put(merged)
      await db.clearDays.delete(merged.logicalDay)
      return merged
    }

    const created: PuffSession = {
      id: environment.randomUUID(),
      ...stampEvent(at, timeZone),
      lastTapAt: instantOf(at, timeZone),
      count: 1,
    }
    await db.puffSessions.add(created)
    await db.clearDays.delete(created.logicalDay)
    return created
  })
}

export async function logResistedUrge(
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

/**
 * Marking a Kick, and taking it back — one toggle, and a live write.
 *
 * Presence of `kickMarkedAt` is the mark, so un-marking deletes the property
 * rather than writing a `false`: the app never asks whether a sitting delivered
 * *nothing*, so it has no such answer to store (ADR 0015).
 *
 * Not a Correction. Marking fills the record's silence about what a sitting gave
 * you rather than changing what the record says happened, which is the exemption
 * `Clear Day` already has — so nothing is proposed, nothing is named, and no
 * derived figure moves. It leaves `lastTapAt` alone, which is what keeps it from
 * closing or extending the Merge Window: that window is keyed to taps.
 */
export async function toggleKick(
  db: VapeOffDatabase,
  id: string,
  at: Date,
  environment: WriteEnvironment,
): Promise<PuffSession | undefined> {
  return db.transaction('rw', db.puffSessions, async () => {
    const session = await db.puffSessions.get(id)
    if (!session) return undefined

    const { kickMarkedAt, ...unmarked } = session
    const toggled: PuffSession = kickMarkedAt === undefined
      ? { ...session, kickMarkedAt: instantOf(at, environment.timeZone()) }
      : unmarked
    await db.puffSessions.put(toggled)
    return toggled
  })
}

/**
 * Declaring a Clear Day. Not a Correction: it asserts something about a day the
 * record has nothing on, so it refuses rather than overwrites when the day
 * turns out to carry a Puff Session after all.
 */
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
