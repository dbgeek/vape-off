import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SCHEMA_VERSION, STORE_SCHEMA, VapeOffDatabase } from './database.ts'
import { getMeta } from './meta.ts'
import { openDatabase } from './open-database.ts'

const databaseNames: string[] = []

function databaseForTest(): VapeOffDatabase {
  const name = `open-test-${crypto.randomUUID()}`
  databaseNames.push(name)
  return new VapeOffDatabase(name)
}

afterEach(async () => {
  await Promise.all(databaseNames.splice(0).map((name) => Dexie.delete(name)))
})

/** The build that froze at `version(1)`: the Kick's own stores, one version behind. */
function buildBeforeTheKick(name: string): VapeOffDatabase {
  const database = new Dexie(name)
  database.version(1).stores(STORE_SCHEMA)
  return database as VapeOffDatabase
}

describe('openDatabase', () => {
  it('retries one transient open failure and returns ok', async () => {
    const db = databaseForTest()
    const open = db.open.bind(db)
    vi.spyOn(db, 'open').mockRejectedValueOnce(new Error('transient')).mockImplementation(open)

    const result = await openDatabase(db, () => '22da2f4a-f10a-47e1-a963-e6793fb15a57')

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') throw new Error('Expected database to open')
    expect(result.database).toBe(db)
    expect(result.installId).toBe('22da2f4a-f10a-47e1-a963-e6793fb15a57')
  })

  it('returns failed-open when both attempts fail', async () => {
    const db = databaseForTest()
    const error = new Error('IndexedDB unavailable')
    vi.spyOn(db, 'open').mockRejectedValue(error)

    await expect(openDatabase(db)).resolves.toEqual({ status: 'failed-open', error })
  })

  it('refuses a database whose installed schema is newer than this build', async () => {
    const db = databaseForTest()
    const newerDatabase = new Dexie(db.name)
    newerDatabase
      .version(SCHEMA_VERSION + 1)
      .stores({ ...STORE_SCHEMA, futureRecords: '++id' })
    await newerDatabase.open()
    newerDatabase.close()

    await expect(openDatabase(db)).resolves.toEqual({
      status: 'older-than-data',
      databaseVersion: SCHEMA_VERSION + 1,
      schemaVersion: SCHEMA_VERSION,
    })
  })

  it('refuses a Kick-carrying database opened by a build that froze at version(1)', async () => {
    const current = databaseForTest()
    await current.open()
    current.close()

    await expect(openDatabase(buildBeforeTheKick(current.name))).resolves.toEqual({
      status: 'older-than-data',
      databaseVersion: 2,
      schemaVersion: 1,
    })
  })

  it('mints installId only on the first open and keeps it in meta', async () => {
    const db = databaseForTest()
    await openDatabase(db, () => '22da2f4a-f10a-47e1-a963-e6793fb15a57')
    db.close()

    const reopened = new VapeOffDatabase(db.name)
    const result = await openDatabase(reopened, () => '860a57b9-4092-4fb8-bb20-726c18c972cc')

    expect(result).toMatchObject({
      status: 'ok',
      installId: '22da2f4a-f10a-47e1-a963-e6793fb15a57',
    })
    await expect(getMeta(reopened, 'installId')).resolves.toBe(
      '22da2f4a-f10a-47e1-a963-e6793fb15a57',
    )
  })

  it('returns one installId when first opens happen concurrently', async () => {
    const first = databaseForTest()
    const second = new VapeOffDatabase(first.name)
    const ids = [
      '22da2f4a-f10a-47e1-a963-e6793fb15a57',
      '860a57b9-4092-4fb8-bb20-726c18c972cc',
    ]

    const [firstResult, secondResult] = await Promise.all([
      openDatabase(first, () => ids.shift()!),
      openDatabase(second, () => ids.shift()!),
    ])

    expect(firstResult.status).toBe('ok')
    expect(secondResult.status).toBe('ok')
    if (firstResult.status !== 'ok' || secondResult.status !== 'ok') {
      throw new Error('Expected both database connections to open')
    }
    expect(firstResult.installId).toBe(secondResult.installId)
  })
})
