import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { VapeOffDatabase } from '../store/database.ts'
import { createStartupSource } from './startup-state.ts'

const databaseNames: string[] = []

function databaseForTest(): VapeOffDatabase {
  const name = `startup-test-${crypto.randomUUID()}`
  databaseNames.push(name)
  return new VapeOffDatabase(name)
}

afterEach(async () => {
  await Promise.all(databaseNames.splice(0).map((name) => Dexie.delete(name)))
})

describe('startup source', () => {
  it('opens the database and distinguishes an empty store from one with history', async () => {
    const empty = databaseForTest()
    const emptySource = createStartupSource(empty, () => 'empty-install')

    await expect(emptySource.load()).resolves.toEqual({
      status: 'ready',
      hasHistory: false,
      installWallBypassed: false,
    })

    const populated = databaseForTest()
    await populated.open()
    await populated.clearDays.add({
      logicalDay: '2026-08-29',
      at: '2026-08-29T12:00:00.000Z',
      tz: 'UTC',
    })
    populated.close()

    await expect(createStartupSource(populated, () => 'populated-install').load()).resolves.toEqual({
      status: 'ready',
      hasHistory: true,
      installWallBypassed: false,
    })
  })

  it('remembers the install-wall escape across a cold start', async () => {
    const database = databaseForTest()
    const source = createStartupSource(database, () => 'install-id')
    await source.load()

    await source.continueAnyway()
    database.close()

    await expect(source.load()).resolves.toMatchObject({
      status: 'ready',
      installWallBypassed: true,
    })
  })
})
