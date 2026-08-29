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
  await db.transaction('rw', db.puffSessions, db.clearDays, async () => {
    await db.puffSessions.add(record)
    await db.clearDays.delete(record.logicalDay)
  })
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
  await db.clearDays.put(record)
  return record
}

export interface PuffSessionEdit {
  at: Date
  count: number
}

export async function updatePuffSession(
  db: VapeOffDatabase,
  id: string,
  input: PuffSessionEdit,
  environment: EventWriteEnvironment = browserEnvironment,
): Promise<PuffSession> {
  if (!Number.isInteger(input.count) || input.count < 1) {
    throw new RangeError('A Puff Session count must be a positive integer')
  }

  return db.transaction('rw', db.puffSessions, db.clearDays, async () => {
    const existing = await db.puffSessions.get(id)
    if (!existing) throw new Error('Puff Session not found')

    const timeZone = environment.timeZone()
    const shift = input.at.getTime() - Date.parse(existing.at)
    const edited: PuffSession = {
      ...existing,
      ...stampEvent(input.at, timeZone),
      lastTapAt: instantOf(new Date(Date.parse(existing.lastTapAt) + shift), timeZone),
      count: input.count,
    }
    await db.puffSessions.put(edited)
    await db.clearDays.delete(edited.logicalDay)
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
  environment: EventWriteEnvironment = browserEnvironment,
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
