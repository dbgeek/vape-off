import type { VapeOffDatabase } from './database.ts'
import { instantOf, stampEvent } from './logical-day.ts'
import type { ClearDay, PuffSession, ResistedUrge } from './records.ts'

export interface EventWriteEnvironment {
  timeZone: () => string
  randomUUID: () => string
}

const browserEnvironment: EventWriteEnvironment = {
  timeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  randomUUID: () => crypto.randomUUID(),
}

export interface PuffSessionWrite {
  at: Date
  lastTapAt: Date
  count: number
}

export async function writePuffSession(
  db: VapeOffDatabase,
  input: PuffSessionWrite,
  environment: EventWriteEnvironment = browserEnvironment,
): Promise<PuffSession> {
  const timeZone = environment.timeZone()
  const record: PuffSession = {
    id: environment.randomUUID(),
    ...stampEvent(input.at, timeZone),
    lastTapAt: instantOf(input.lastTapAt, timeZone),
    count: input.count,
  }
  await db.puffSessions.add(record)
  return record
}

export async function writeResistedUrge(
  db: VapeOffDatabase,
  at: Date,
  environment: EventWriteEnvironment = browserEnvironment,
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
  environment: EventWriteEnvironment = browserEnvironment,
): Promise<ClearDay> {
  const record = stampEvent(at, environment.timeZone())
  await db.clearDays.add(record)
  return record
}
