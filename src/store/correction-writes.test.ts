import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { writeCorrection } from './correction-writes.ts'
import { VapeOffDatabase } from './database.ts'
import { writeClearDay } from './track-writes.ts'

const databases: VapeOffDatabase[] = []

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.delete()))
})

function databaseForTest(): VapeOffDatabase {
  const db = new VapeOffDatabase(`correction-writes-test-${crypto.randomUUID()}`)
  databases.push(db)
  return db
}

/** Corrections are judged against a clock, so the store can refuse a future one. */
function environmentAt(
  now: string,
  timeZone: string,
  ids: string[] = ['4f341b0a-b09a-4ddc-b68c-e570b20c90db'],
) {
  const remaining = [...ids]
  return {
    now: () => new Date(now),
    timeZone: () => timeZone,
    randomUUID: () => remaining.shift()!,
  }
}

describe('writing a Correction', () => {
  it('adds UUID identities and stamps event time, Logical Day and device zone', async () => {
    const db = databaseForTest()
    const environment = environmentAt('2026-08-30T12:00:00.000Z', 'Europe/Stockholm', [
      '4f341b0a-b09a-4ddc-b68c-e570b20c90db',
      '79ae9e0b-dd6f-4e54-b3f7-77947eff8a0e',
    ])

    await expect(
      writeCorrection(
        db,
        { kind: 'add-puff-session', at: new Date('2026-08-29T01:59:00.000Z'), count: 2 },
        environment,
      ),
    ).resolves.toEqual({ status: 'corrected' })
    await writeCorrection(
      db,
      { kind: 'add-resisted-urge', at: new Date('2026-08-29T02:00:00.000Z') },
      environment,
    )

    await expect(db.puffSessions.toArray()).resolves.toEqual([
      {
        id: '4f341b0a-b09a-4ddc-b68c-e570b20c90db',
        at: '2026-08-29T03:59:00.000+02:00',
        lastTapAt: '2026-08-29T03:59:00.000+02:00',
        count: 2,
        logicalDay: '2026-08-28',
        tz: 'Europe/Stockholm',
      },
    ])
    await expect(db.resistedUrges.toArray()).resolves.toEqual([
      {
        id: '79ae9e0b-dd6f-4e54-b3f7-77947eff8a0e',
        at: '2026-08-29T04:00:00.000+02:00',
        logicalDay: '2026-08-29',
        tz: 'Europe/Stockholm',
      },
    ])
  })

  it('drops a Clear Day when a Puff Session is written into it', async () => {
    const db = databaseForTest()
    const environment = environmentAt('2026-08-30T12:00:00.000Z', 'Europe/Stockholm')
    const at = new Date('2026-08-28T10:00:00.000Z')
    await writeClearDay(db, at, environment)

    await writeCorrection(db, { kind: 'add-puff-session', at, count: 1 }, environment)

    await expect(db.puffSessions.count()).resolves.toBe(1)
    await expect(db.clearDays.get('2026-08-28')).resolves.toBeUndefined()
  })

  it('leaves a Clear Day standing when a Resisted Urge is written into it', async () => {
    const db = databaseForTest()
    const environment = environmentAt('2026-08-30T12:00:00.000Z', 'UTC')
    const at = new Date('2026-08-28T10:00:00.000Z')
    await writeClearDay(db, at, environment)

    await writeCorrection(db, { kind: 'add-resisted-urge', at }, environment)

    await expect(db.clearDays.get('2026-08-28')).resolves.toBeDefined()
  })

  it('re-stamps an edited Puff Session, moving the last tap with the first', async () => {
    const db = databaseForTest()
    const environment = environmentAt('2026-08-30T12:00:00.000Z', 'Europe/Stockholm')
    // A pickup that ran two minutes: the edit has to move the last tap with the
    // first, so seed the span rather than writing a fresh single-tap Session.
    await db.puffSessions.add({
      id: 'a-two-minute-pickup',
      at: '2026-08-28T12:00:00.000+02:00',
      lastTapAt: '2026-08-28T12:02:00.000+02:00',
      count: 2,
      logicalDay: '2026-08-28',
      tz: 'Europe/Stockholm',
    })
    const movedAt = new Date('2026-08-29T01:00:00.000Z')
    await writeClearDay(db, movedAt, environment)

    await writeCorrection(
      db,
      { kind: 'update-puff-session', id: 'a-two-minute-pickup', at: movedAt, count: 4 },
      environment,
    )

    await expect(db.puffSessions.get('a-two-minute-pickup')).resolves.toMatchObject({
      at: '2026-08-29T03:00:00.000+02:00',
      lastTapAt: '2026-08-29T03:02:00.000+02:00',
      count: 4,
      logicalDay: '2026-08-28',
      tz: 'Europe/Stockholm',
    })
    await expect(db.clearDays.get('2026-08-28')).resolves.toBeUndefined()
  })

  it('edits and hard-deletes event records without leaving edit history', async () => {
    const db = databaseForTest()
    const environment = environmentAt('2026-08-30T12:00:00.000Z', 'UTC', [
      '4f341b0a-b09a-4ddc-b68c-e570b20c90db',
      '79ae9e0b-dd6f-4e54-b3f7-77947eff8a0e',
    ])
    await writeCorrection(
      db,
      { kind: 'add-puff-session', at: new Date('2026-08-28T10:00:00.000Z'), count: 1 },
      environment,
    )
    await writeCorrection(
      db,
      { kind: 'add-resisted-urge', at: new Date('2026-08-28T11:00:00.000Z') },
      environment,
    )

    await writeCorrection(
      db,
      {
        kind: 'update-resisted-urge',
        id: '79ae9e0b-dd6f-4e54-b3f7-77947eff8a0e',
        at: new Date('2026-08-29T12:00:00.000Z'),
      },
      environment,
    )
    await expect(
      db.resistedUrges.get('79ae9e0b-dd6f-4e54-b3f7-77947eff8a0e'),
    ).resolves.toMatchObject({ logicalDay: '2026-08-29', at: '2026-08-29T12:00:00.000+00:00' })

    await writeCorrection(
      db,
      { kind: 'delete-puff-session', id: '4f341b0a-b09a-4ddc-b68c-e570b20c90db' },
      environment,
    )
    await writeCorrection(
      db,
      { kind: 'delete-resisted-urge', id: '79ae9e0b-dd6f-4e54-b3f7-77947eff8a0e' },
      environment,
    )

    await expect(db.puffSessions.toArray()).resolves.toEqual([])
    await expect(db.resistedUrges.toArray()).resolves.toEqual([])
  })

  it('refuses a Correction landing in the future, and writes nothing', async () => {
    const db = databaseForTest()
    const environment = environmentAt('2026-08-29T12:00:00.000Z', 'UTC')

    await expect(
      writeCorrection(
        db,
        { kind: 'add-puff-session', at: new Date('2026-08-29T13:00:00.000Z'), count: 1 },
        environment,
      ),
    ).resolves.toEqual({ status: 'refused', reason: 'in-the-future' })
    await expect(db.puffSessions.toArray()).resolves.toEqual([])
  })

  it('refuses a puff count below one, and writes nothing', async () => {
    const db = databaseForTest()
    const environment = environmentAt('2026-08-30T12:00:00.000Z', 'UTC')

    await expect(
      writeCorrection(
        db,
        { kind: 'add-puff-session', at: new Date('2026-08-29T12:00:00.000Z'), count: 0 },
        environment,
      ),
    ).resolves.toEqual({ status: 'refused', reason: 'count-below-one' })
    await expect(db.puffSessions.toArray()).resolves.toEqual([])
  })

  it('carries a Kick through a re-timing Correction and drops it with the Session', async () => {
    const db = databaseForTest()
    const environment = environmentAt('2026-08-30T12:00:00.000Z', 'Europe/Stockholm')
    await db.puffSessions.add({
      id: 'a-kicked-pickup',
      at: '2026-08-28T12:00:00.000+02:00',
      lastTapAt: '2026-08-28T12:02:00.000+02:00',
      count: 2,
      logicalDay: '2026-08-28',
      tz: 'Europe/Stockholm',
      kickMarkedAt: '2026-08-28T12:05:00.000+02:00',
    })

    await writeCorrection(
      db,
      {
        kind: 'update-puff-session',
        id: 'a-kicked-pickup',
        at: new Date('2026-08-29T10:00:00.000Z'),
        count: 4,
      },
      environment,
    )

    // The mark travels with the sitting and re-buckets with it; the instant you
    // said so is not re-stamped, because the Correction did not change when you
    // said it.
    await expect(db.puffSessions.get('a-kicked-pickup')).resolves.toEqual({
      id: 'a-kicked-pickup',
      at: '2026-08-29T12:00:00.000+02:00',
      lastTapAt: '2026-08-29T12:02:00.000+02:00',
      count: 4,
      logicalDay: '2026-08-29',
      tz: 'Europe/Stockholm',
      kickMarkedAt: '2026-08-28T12:05:00.000+02:00',
    })

    await writeCorrection(
      db,
      { kind: 'delete-puff-session', id: 'a-kicked-pickup' },
      environment,
    )

    await expect(db.puffSessions.toArray()).resolves.toEqual([])
  })
})
