import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SCHEMA_VERSION, STORE_SCHEMA, VapeOffDatabase } from './database.ts'
import { getMeta } from './meta.ts'
import type { PuffSession, RatchetStep } from './records.ts'
import { createStoreSession, type SessionEnvironment } from './session.ts'

const databaseNames: string[] = []

afterEach(async () => {
  await Promise.all(databaseNames.splice(0).map((name) => Dexie.delete(name)))
})

function databaseForTest(): VapeOffDatabase {
  const name = `session-test-${crypto.randomUUID()}`
  databaseNames.push(name)
  return new VapeOffDatabase(name)
}

function environmentFor(overrides: Partial<SessionEnvironment> = {}): SessionEnvironment {
  return {
    now: () => new Date('2026-09-15T12:00:00.000Z'),
    timeZone: () => 'UTC',
    randomUUID: () => crypto.randomUUID(),
    badge: {},
    ...overrides,
  }
}

function puffSession(logicalDay: string, count: number): PuffSession {
  return {
    id: `session-${logicalDay}`,
    at: `${logicalDay}T12:00:00.000Z`,
    lastTapAt: `${logicalDay}T12:01:00.000Z`,
    count,
    logicalDay,
    tz: 'UTC',
  }
}

/** A Ratchet Step in force well before every clock in this file. */
function step(target: number): RatchetStep {
  return {
    id: 'step',
    effectiveFrom: '2026-08-20',
    target,
    kind: 'earned',
    at: '2026-08-20T04:00:00.000Z',
  }
}

describe('store session', () => {
  it('opens the connection once however many callers ask, and asks nobody to say so', async () => {
    const db = databaseForTest()
    const session = createStoreSession(db, environmentFor())
    const open = vi.spyOn(db, 'open')

    // Every member opens for itself: there is no `ensureOpen` to call first, and
    // no order for these to be in.
    await Promise.all([session.readRecord(), session.database()])
    await session.evaluate()
    await session.write(async () => undefined)

    expect(open).toHaveBeenCalledOnce()
    expect(db.isOpen()).toBe(true)
  })

  it('refuses to serve a database this build cannot open', async () => {
    const db = databaseForTest()
    const newerDatabase = new Dexie(db.name)
    newerDatabase
      .version(SCHEMA_VERSION + 1)
      .stores({ ...STORE_SCHEMA, futureRecords: '++id' })
    await newerDatabase.open()
    newerDatabase.close()
    const session = createStoreSession(db, environmentFor())

    await expect(session.readRecord()).rejects.toThrow('Database is older-than-data')
  })

  it('reads the whole record in one read', async () => {
    const db = databaseForTest()
    const session = createStoreSession(db, environmentFor())
    await session.database()
    await db.puffSessions.add(puffSession('2026-08-28', 2))
    await db.resistedUrges.add({
      id: 'urge',
      at: '2026-08-28T13:00:00.000Z',
      logicalDay: '2026-08-28',
      tz: 'UTC',
    })
    await db.clearDays.add({
      logicalDay: '2026-08-27',
      at: '2026-08-27T20:00:00.000Z',
      tz: 'UTC',
    })
    await db.ratchetSteps.add({
      id: 'step',
      effectiveFrom: '2026-08-20',
      target: 5,
      kind: 'earned',
      at: '2026-08-20T04:00:00.000Z',
    })

    await expect(session.readRecord()).resolves.toEqual({
      puffSessions: [puffSession('2026-08-28', 2)],
      resistedUrges: [expect.objectContaining({ id: 'urge' })],
      clearDays: [expect.objectContaining({ logicalDay: '2026-08-27' })],
      ratchetSteps: [expect.objectContaining({ id: 'step' })],
    })
  })

  it('evaluates the Ratchet as of the instant it is given, not the device clock', async () => {
    const db = databaseForTest()
    const session = createStoreSession(db, environmentFor({ randomUUID: () => 'first-step' }))
    await session.database()
    await db.puffSessions.bulkAdd(
      ['22', '23', '24', '25', '26', '27', '28'].map((day) =>
        puffSession(`2026-08-${day}`, 20),
      ),
    )

    await expect(session.evaluate(new Date('2026-08-29T12:00:00.000Z'))).resolves.toEqual({
      status: 'step-written',
      step: {
        id: 'first-step',
        effectiveFrom: '2026-08-29',
        target: 18,
        kind: 'earned',
        at: '2026-08-29T12:00:00.000+00:00',
      },
    })
  })

  /**
   * The badge is a projection of the record and nothing maintains it separately
   * (ADR 0016), so it is asserted through the read rather than through a refresh
   * of its own — there is no longer one to call.
   */
  it('leaves the badge agreeing with the record it read', async () => {
    const db = databaseForTest()
    const badge = {
      setAppBadge: vi.fn().mockResolvedValue(undefined),
      clearAppBadge: vi.fn().mockResolvedValue(undefined),
    }
    const session = createStoreSession(db, environmentFor({ badge }))
    const opened = await session.database()
    await opened.ratchetSteps.add(step(5))
    await opened.puffSessions.add(puffSession('2026-09-15', 2))

    await session.readRecord()

    expect(badge.setAppBadge).toHaveBeenCalledWith(3)
  })

  it('keeps the badge refresh best-effort: a badge that throws is not a failed read', async () => {
    const db = databaseForTest()
    const badge = {
      setAppBadge: vi.fn().mockRejectedValue(new Error('Badging is not permitted')),
      clearAppBadge: vi.fn().mockResolvedValue(undefined),
    }
    const session = createStoreSession(db, environmentFor({ badge }))
    const opened = await session.database()
    await opened.ratchetSteps.add(step(5))

    await expect(session.readRecord()).resolves.toMatchObject({
      ratchetSteps: [expect.objectContaining({ target: 5 })],
    })
    expect(badge.setAppBadge).toHaveBeenCalledWith(5)
  })

  /**
   * The Ratchet evaluates on every write, so no write leaves the programme's
   * derived figures a beat behind until something else happens to read.
   */
  it('evaluates the Ratchet on every write, and answers with the operation and the record', async () => {
    const db = databaseForTest()
    const session = createStoreSession(
      db,
      environmentFor({
        now: () => new Date('2026-08-29T12:00:00.000Z'),
        randomUUID: () => 'first-step',
      }),
    )
    const opened = await session.database()
    await opened.puffSessions.bulkAdd(
      ['22', '23', '24', '25', '26', '27', '28'].map((day) => puffSession(`2026-08-${day}`, 20)),
    )

    const { result, record } = await session.write(async (written) => {
      await written.resistedUrges.add({
        id: 'urge',
        at: '2026-08-29T11:00:00.000Z',
        logicalDay: '2026-08-29',
        tz: 'UTC',
      })
      return 'what the operation answered'
    })

    expect(result).toBe('what the operation answered')
    expect(record.resistedUrges).toEqual([expect.objectContaining({ id: 'urge' })])
    expect(record.ratchetSteps).toEqual([expect.objectContaining({ target: 18, kind: 'earned' })])
  })

  it('resets to a fresh database and reopens it as the same session', async () => {
    const db = databaseForTest()
    const installIds = ['first-install', 'second-install']
    const session = createStoreSession(
      db,
      environmentFor({ randomUUID: () => installIds.shift() ?? 'unexpected' }),
    )
    await session.database()
    await db.puffSessions.add(puffSession('2026-08-28', 9))
    await expect(getMeta(db, 'installId')).resolves.toBe('first-install')

    await session.reset()

    expect(db.isOpen()).toBe(true)
    await expect(db.puffSessions.count()).resolves.toBe(0)
    await expect(getMeta(db, 'installId')).resolves.toBe('second-install')
  })
})
