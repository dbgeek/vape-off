import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { SCHEMA_VERSION, STORE_SCHEMA, VapeOffDatabase } from './database.ts'
import type {
  ClearDay,
  ExportRecord,
  MetaRecord,
  PuffSession,
  RatchetStep,
  ResistedUrge,
} from './records.ts'

const databaseNames: string[] = []

function databaseForTest(): VapeOffDatabase {
  const name = `vape-off-test-${crypto.randomUUID()}`
  databaseNames.push(name)
  return new VapeOffDatabase(name)
}

afterEach(async () => {
  await Promise.all(databaseNames.splice(0).map((name) => new VapeOffDatabase(name).delete()))
})

describe('VapeOffDatabase', () => {
  it('round-trips the six declared record types', async () => {
    const db = databaseForTest()
    const puffSession: PuffSession = {
      id: '4f341b0a-b09a-4ddc-b68c-e570b20c90db',
      at: '2026-08-29T21:14:03.221+02:00',
      lastTapAt: '2026-08-29T21:14:47.221+02:00',
      count: 3,
      logicalDay: '2026-08-29',
      tz: 'Europe/Stockholm',
      kickMarkedAt: '2026-08-29T21:16:10.004+02:00',
    }
    const resistedUrge: ResistedUrge = {
      id: '79ae9e0b-dd6f-4e54-b3f7-77947eff8a0e',
      at: '2026-08-29T22:00:00.000+02:00',
      logicalDay: '2026-08-29',
      tz: 'Europe/Stockholm',
    }
    const clearDay: ClearDay = {
      logicalDay: '2026-08-28',
      at: '2026-08-29T08:00:00.000+02:00',
      tz: 'Europe/Stockholm',
    }
    const ratchetStep: RatchetStep = {
      id: '21cdbe01-c9f9-4017-a780-8a4a668a8fa2',
      effectiveFrom: '2026-08-29',
      target: 18,
      kind: 'earned',
      at: '2026-08-29T08:01:00.000+02:00',
    }
    const exportRecord: ExportRecord = {
      id: 'ad5f0248-41da-4ae0-9060-cc1cd6e94818',
      at: '2026-08-29T23:00:00.000+02:00',
      logicalDay: '2026-08-29',
      restoredFrom: 'd3abbd53-cff2-4615-bff4-32e3b01448d7',
    }
    const metaRecord: MetaRecord = { key: 'firstRunCardDismissed', value: true }

    await db.transaction('rw', db.tables, async () => {
      await db.puffSessions.add(puffSession)
      await db.resistedUrges.add(resistedUrge)
      await db.clearDays.add(clearDay)
      await db.ratchetSteps.add(ratchetStep)
      await db.exports.add(exportRecord)
      await db.meta.add(metaRecord)
    })

    await expect(db.puffSessions.get(puffSession.id)).resolves.toEqual(puffSession)
    await expect(db.resistedUrges.get(resistedUrge.id)).resolves.toEqual(resistedUrge)
    await expect(db.clearDays.get(clearDay.logicalDay)).resolves.toEqual(clearDay)
    await expect(db.ratchetSteps.get(ratchetStep.id)).resolves.toEqual(ratchetStep)
    await expect(db.exports.get(exportRecord.id)).resolves.toEqual(exportRecord)
    await expect(db.meta.get(metaRecord.key)).resolves.toEqual(metaRecord)
  })

  it('declares the highest version it holds, so an older build can refuse this data', async () => {
    const db = databaseForTest()
    await db.open()

    expect(SCHEMA_VERSION).toBe(2)
    expect(db.verno).toBe(SCHEMA_VERSION)
  })

  it('opens a version(1) database at version(2) without an upgrade touching its rows', async () => {
    const db = databaseForTest()
    const beforeTheKick = new Dexie(db.name)
    beforeTheKick.version(1).stores(STORE_SCHEMA)
    await beforeTheKick.open()
    await beforeTheKick.table('puffSessions').add({
      id: '4f341b0a-b09a-4ddc-b68c-e570b20c90db',
      at: '2026-08-29T21:14:03.221+02:00',
      lastTapAt: '2026-08-29T21:14:47.221+02:00',
      count: 3,
      logicalDay: '2026-08-29',
      tz: 'Europe/Stockholm',
    })
    beforeTheKick.close()

    await db.open()

    expect(db.verno).toBe(2)
    await expect(db.puffSessions.toArray()).resolves.toEqual([
      {
        id: '4f341b0a-b09a-4ddc-b68c-e570b20c90db',
        at: '2026-08-29T21:14:03.221+02:00',
        lastTapAt: '2026-08-29T21:14:47.221+02:00',
        count: 3,
        logicalDay: '2026-08-29',
        tz: 'Europe/Stockholm',
      },
    ])
  })
})
