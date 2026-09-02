import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { VapeOffDatabase } from './database.ts'
import { logPuff, logResistedUrge, toggleKick, writeClearDay } from './track-writes.ts'

const databaseNames: string[] = []

afterEach(async () => {
  await Promise.all(databaseNames.splice(0).map((name) => new VapeOffDatabase(name).delete()))
})

function databaseForTest(): VapeOffDatabase {
  const name = `track-writes-test-${crypto.randomUUID()}`
  databaseNames.push(name)
  return new VapeOffDatabase(name)
}

describe('Track writes', () => {
  it('keeps a sliding burst in one Puff Session across a cold start', async () => {
    const first = databaseForTest()
    const environment = {
      timeZone: () => 'Europe/Stockholm',
      randomUUID: () => '4f341b0a-b09a-4ddc-b68c-e570b20c90db',
    }

    await logPuff(first, new Date('2026-08-29T17:00:00.000Z'), environment)
    await logPuff(first, new Date('2026-08-29T17:01:20.000Z'), environment)
    first.close()

    const reopened = new VapeOffDatabase(first.name)
    await logPuff(reopened, new Date('2026-08-29T17:02:40.000Z'), environment)

    await expect(reopened.puffSessions.toArray()).resolves.toEqual([
      {
        id: '4f341b0a-b09a-4ddc-b68c-e570b20c90db',
        at: '2026-08-29T19:00:00.000+02:00',
        lastTapAt: '2026-08-29T19:02:40.000+02:00',
        count: 3,
        logicalDay: '2026-08-29',
        tz: 'Europe/Stockholm',
      },
    ])
  })

  it('stamps a live Resisted Urge with its Logical Day and device zone', async () => {
    const db = databaseForTest()
    const environment = {
      timeZone: () => 'Europe/Stockholm',
      randomUUID: () => '79ae9e0b-dd6f-4e54-b3f7-77947eff8a0e',
    }

    await logResistedUrge(db, new Date('2026-08-29T02:00:00.000Z'), environment)

    await expect(db.resistedUrges.toArray()).resolves.toEqual([
      {
        id: '79ae9e0b-dd6f-4e54-b3f7-77947eff8a0e',
        at: '2026-08-29T04:00:00.000+02:00',
        logicalDay: '2026-08-29',
        tz: 'Europe/Stockholm',
      },
    ])
  })

  it('declares a Clear Day against the Logical Day the moment falls in', async () => {
    const db = databaseForTest()
    const environment = {
      timeZone: () => 'Europe/Stockholm',
      randomUUID: () => '4f341b0a-b09a-4ddc-b68c-e570b20c90db',
    }

    const clearDay = await writeClearDay(db, new Date('2026-08-30T01:59:00.000Z'), environment)

    expect(clearDay).toBeDefined()
    await expect(db.clearDays.get('2026-08-29')).resolves.toEqual({
      at: '2026-08-30T03:59:00.000+02:00',
      logicalDay: '2026-08-29',
      tz: 'Europe/Stockholm',
    })
  })

  it('refuses a Clear Day on a Logical Day that already has a Puff Session', async () => {
    const db = databaseForTest()
    const environment = {
      timeZone: () => 'UTC',
      randomUUID: () => '4f341b0a-b09a-4ddc-b68c-e570b20c90db',
    }
    const at = new Date('2026-08-28T12:00:00.000Z')
    await logPuff(db, at, environment)

    await expect(writeClearDay(db, at, environment)).resolves.toBeUndefined()
    await expect(db.clearDays.get('2026-08-28')).resolves.toBeUndefined()
  })

  it('marks a Kick with the instant you said so, and un-marks by deleting the property', async () => {
    const db = databaseForTest()
    const environment = {
      timeZone: () => 'Europe/Stockholm',
      randomUUID: () => '4f341b0a-b09a-4ddc-b68c-e570b20c90db',
    }
    const session = await logPuff(db, new Date('2026-08-29T17:00:00.000Z'), environment)

    const marked = await toggleKick(
      db,
      session.id,
      new Date('2026-08-29T17:02:00.000Z'),
      environment,
    )

    expect(marked).toEqual({ ...session, kickMarkedAt: '2026-08-29T19:02:00.000+02:00' })
    await expect(db.puffSessions.get(session.id)).resolves.toEqual(marked)

    const unmarked = await toggleKick(
      db,
      session.id,
      new Date('2026-08-29T17:03:00.000Z'),
      environment,
    )

    expect(unmarked).toEqual(session)
    expect(unmarked).not.toHaveProperty('kickMarkedAt')
    const stored = await db.puffSessions.get(session.id)
    expect(stored).toEqual(session)
    expect(stored).not.toHaveProperty('kickMarkedAt')
  })

  it('holds a Kick while the Merge Window grows the sitting around it', async () => {
    const db = databaseForTest()
    const environment = {
      timeZone: () => 'Europe/Stockholm',
      randomUUID: () => '4f341b0a-b09a-4ddc-b68c-e570b20c90db',
    }
    const session = await logPuff(db, new Date('2026-08-29T17:00:00.000Z'), environment)
    await toggleKick(db, session.id, new Date('2026-08-29T17:00:10.000Z'), environment)

    await logPuff(db, new Date('2026-08-29T17:01:00.000Z'), environment)

    await expect(db.puffSessions.toArray()).resolves.toEqual([
      {
        ...session,
        lastTapAt: '2026-08-29T19:01:00.000+02:00',
        count: 2,
        kickMarkedAt: '2026-08-29T19:00:10.000+02:00',
      },
    ])
  })

  it('leaves the Merge Window keyed to taps alone, neither closing nor extending it', async () => {
    const db = databaseForTest()
    const ids = ['4f341b0a-b09a-4ddc-b68c-e570b20c90db', '79ae9e0b-dd6f-4e54-b3f7-77947eff8a0e']
    const environment = {
      timeZone: () => 'Europe/Stockholm',
      randomUUID: () => ids.shift()!,
    }
    const session = await logPuff(db, new Date('2026-08-29T17:00:00.000Z'), environment)

    // Marking mid-sitting must not close the Window: the next tap still merges.
    await toggleKick(db, session.id, new Date('2026-08-29T17:00:30.000Z'), environment)
    await logPuff(db, new Date('2026-08-29T17:01:00.000Z'), environment)
    // Nor extend it: the Window runs from that tap, not from the mark after it.
    await toggleKick(db, session.id, new Date('2026-08-29T17:01:10.000Z'), environment)
    await logPuff(db, new Date('2026-08-29T17:02:40.000Z'), environment)

    await expect(db.puffSessions.orderBy('at').toArray()).resolves.toMatchObject([
      { id: session.id, count: 2, lastTapAt: '2026-08-29T19:01:00.000+02:00' },
      { id: '79ae9e0b-dd6f-4e54-b3f7-77947eff8a0e', count: 1 },
    ])
  })

  it('says nothing about a Puff Session the record does not hold', async () => {
    const db = databaseForTest()
    const environment = {
      timeZone: () => 'Europe/Stockholm',
      randomUUID: () => '4f341b0a-b09a-4ddc-b68c-e570b20c90db',
    }

    await expect(
      toggleKick(db, 'never-happened', new Date('2026-08-29T17:00:00.000Z'), environment),
    ).resolves.toBeUndefined()
    await expect(db.puffSessions.toArray()).resolves.toEqual([])
  })
})
