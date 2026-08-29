import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { VapeOffDatabase } from './database.ts'
import { logPuff } from './track-writes.ts'

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
})
