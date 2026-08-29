import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { VapeOffDatabase } from './database.ts'
import { writeClearDay, writePuffSession, writeResistedUrge } from './event-writes.ts'

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
      {
        at: new Date('2026-08-29T01:59:00.000Z'),
        lastTapAt: new Date('2026-08-29T02:00:00.000Z'),
        count: 2,
      },
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
      lastTapAt: '2026-08-29T04:00:00.000+02:00',
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
    await expect(db.clearDays.get(clearDay.logicalDay)).resolves.toEqual({
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
      { at, lastTapAt: at, count: 1 },
      environment,
    )

    await expect(db.puffSessions.get(session.id)).resolves.toEqual(session)
    await expect(db.clearDays.get('2026-08-28')).resolves.toBeUndefined()
  })
})
