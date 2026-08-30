import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { VapeOffDatabase } from './database.ts'
import {
  deletePuffSession,
  deleteResistedUrge,
  updatePuffSession,
  updateResistedUrge,
  writeClearDay,
  writePuffSession,
  writeResistedUrge,
} from './event-writes.ts'

const databases: VapeOffDatabase[] = []

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.delete()))
})

describe('event writes', () => {
  it('adds UUID identities and stamps event time, Logical Day, and device zone at the write seam', async () => {
    const db = new VapeOffDatabase(`event-writes-test-${crypto.randomUUID()}`)
    databases.push(db)
    const ids = [
      '4f341b0a-b09a-4ddc-b68c-e570b20c90db',
      '79ae9e0b-dd6f-4e54-b3f7-77947eff8a0e',
    ]
    const environment = {
      timeZone: () => 'Europe/Stockholm',
      randomUUID: () => ids.shift()!,
    }

    const puffSession = await writePuffSession(
      db,
      { kind: 'add-puff-session', at: new Date('2026-08-29T01:59:00.000Z'), count: 2 },
      environment,
    )
    const resistedUrge = await writeResistedUrge(
      db,
      new Date('2026-08-29T02:00:00.000Z'),
      environment,
    )
    const clearDay = await writeClearDay(
      db,
      new Date('2026-08-30T01:59:00.000Z'),
      environment,
    )

    await expect(db.puffSessions.get(puffSession.id)).resolves.toEqual({
      id: '4f341b0a-b09a-4ddc-b68c-e570b20c90db',
      at: '2026-08-29T03:59:00.000+02:00',
      lastTapAt: '2026-08-29T03:59:00.000+02:00',
      count: 2,
      logicalDay: '2026-08-28',
      tz: 'Europe/Stockholm',
    })
    await expect(db.resistedUrges.get(resistedUrge.id)).resolves.toEqual({
      id: '79ae9e0b-dd6f-4e54-b3f7-77947eff8a0e',
      at: '2026-08-29T04:00:00.000+02:00',
      logicalDay: '2026-08-29',
      tz: 'Europe/Stockholm',
    })
    expect(clearDay).toBeDefined()
    await expect(db.clearDays.get(clearDay!.logicalDay)).resolves.toEqual({
      at: '2026-08-30T03:59:00.000+02:00',
      logicalDay: '2026-08-29',
      tz: 'Europe/Stockholm',
    })
  })

  it('drops a Clear Day when a Puff Session is written into it', async () => {
    const db = new VapeOffDatabase(`event-writes-test-${crypto.randomUUID()}`)
    databases.push(db)
    const environment = {
      timeZone: () => 'Europe/Stockholm',
      randomUUID: () => '4f341b0a-b09a-4ddc-b68c-e570b20c90db',
    }
    const at = new Date('2026-08-28T10:00:00.000Z')
    await writeClearDay(db, at, environment)

    const session = await writePuffSession(
      db,
      { kind: 'add-puff-session', at, count: 1 },
      environment,
    )

    await expect(db.puffSessions.get(session.id)).resolves.toEqual(session)
    await expect(db.clearDays.get('2026-08-28')).resolves.toBeUndefined()
  })

  it('does not declare a Clear Day when the Logical Day already has a Puff Session', async () => {
    const db = new VapeOffDatabase(`event-writes-test-${crypto.randomUUID()}`)
    databases.push(db)
    const environment = {
      timeZone: () => 'UTC',
      randomUUID: () => '4f341b0a-b09a-4ddc-b68c-e570b20c90db',
    }
    const at = new Date('2026-08-28T12:00:00.000Z')
    await writePuffSession(db, { kind: 'add-puff-session', at, count: 1 }, environment)

    await expect(writeClearDay(db, at, environment)).resolves.toBeUndefined()
    await expect(db.clearDays.get('2026-08-28')).resolves.toBeUndefined()
  })

  it('re-stamps an edited Puff Session and drops a Clear Day at its new time', async () => {
    const db = new VapeOffDatabase(`event-writes-test-${crypto.randomUUID()}`)
    databases.push(db)
    const environment = {
      timeZone: () => 'Europe/Stockholm',
      randomUUID: () => '4f341b0a-b09a-4ddc-b68c-e570b20c90db',
    }
    // A pickup that ran two minutes: the edit has to move the last tap with the
    // first, so seed the span rather than writing a fresh single-tap Session.
    const session = {
      id: 'a-two-minute-pickup',
      at: '2026-08-28T12:00:00.000+02:00',
      lastTapAt: '2026-08-28T12:02:00.000+02:00',
      count: 2,
      logicalDay: '2026-08-28',
      tz: 'Europe/Stockholm',
    }
    await db.puffSessions.add(session)
    const movedAt = new Date('2026-08-29T01:00:00.000Z')
    await writeClearDay(db, movedAt, environment)

    const edited = await updatePuffSession(
      db,
      { kind: 'update-puff-session', id: session.id, at: movedAt, count: 4 },
      environment,
    )

    expect(edited).toMatchObject({
      at: '2026-08-29T03:00:00.000+02:00',
      lastTapAt: '2026-08-29T03:02:00.000+02:00',
      count: 4,
      logicalDay: '2026-08-28',
      tz: 'Europe/Stockholm',
    })
    await expect(db.clearDays.get('2026-08-28')).resolves.toBeUndefined()
  })

  it('edits and hard-deletes event records without leaving edit history', async () => {
    const db = new VapeOffDatabase(`event-writes-test-${crypto.randomUUID()}`)
    databases.push(db)
    const environment = {
      timeZone: () => 'UTC',
      randomUUID: () => '79ae9e0b-dd6f-4e54-b3f7-77947eff8a0e',
    }
    const session = await writePuffSession(
      db,
      { kind: 'add-puff-session', at: new Date('2026-08-28T10:00:00.000Z'), count: 1 },
      environment,
    )
    const urge = await writeResistedUrge(
      db,
      new Date('2026-08-28T11:00:00.000Z'),
      environment,
    )

    await expect(
      updateResistedUrge(db, urge.id, new Date('2026-08-29T12:00:00.000Z'), environment),
    ).resolves.toMatchObject({ logicalDay: '2026-08-29', at: '2026-08-29T12:00:00.000+00:00' })
    await deletePuffSession(db, session.id)
    await deleteResistedUrge(db, urge.id)

    await expect(db.puffSessions.toArray()).resolves.toEqual([])
    await expect(db.resistedUrges.toArray()).resolves.toEqual([])
  })
})
