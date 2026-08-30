import { instantOf, stampEvent } from '../domain/logical-day.ts'
import { openSessionAt } from '../domain/merge-window.ts'
import type { VapeOffDatabase } from './database.ts'
import type { ClearDay, PuffSession, ResistedUrge } from './records.ts'
import type { WriteEnvironment } from './session.ts'

/**
 * The live taps: what the Track screen writes in the moment.
 *
 * Distinct from a Correction, which changes what the record already says and is
 * written in `correction-writes.ts`. A tap is neither deliberate about the past
 * nor reversible by naming it, so nothing here is proposed before it is made.
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
