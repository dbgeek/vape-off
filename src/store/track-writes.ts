import type { VapeOffDatabase } from './database.ts'
import { instantOf, stampEvent } from './logical-day.ts'
import type { PuffSession } from './records.ts'

const MERGE_WINDOW_MS = 90 * 1000

export interface TrackWriteEnvironment {
  timeZone: () => string
  randomUUID: () => string
}

const browserEnvironment: TrackWriteEnvironment = {
  timeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  randomUUID: () => crypto.randomUUID(),
}

export async function logPuff(
  db: VapeOffDatabase,
  at: Date,
  environment: TrackWriteEnvironment = browserEnvironment,
): Promise<PuffSession> {
  const timeZone = environment.timeZone()

  return db.transaction('rw', db.puffSessions, db.clearDays, async () => {
    const sessions = await db.puffSessions.toArray()
    const openSession = sessions
      .filter((session) => {
        const sinceLastTap = at.getTime() - Date.parse(session.lastTapAt)
        return sinceLastTap >= 0 && sinceLastTap <= MERGE_WINDOW_MS
      })
      .sort((left, right) => Date.parse(right.lastTapAt) - Date.parse(left.lastTapAt))[0]

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
