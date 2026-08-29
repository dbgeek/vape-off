import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMeta, setMeta } from '../store/meta.ts'
import { VapeOffDatabase } from '../store/database.ts'
import { createBrowserBackupSource } from './browser-backup-source.ts'

const databases: VapeOffDatabase[] = []

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.delete()))
})

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(String(reader.result)))
    reader.addEventListener('error', () => reject(reader.error))
    reader.readAsText(file)
  })
}

describe('browser Backup source', () => {
  it('builds from the loaded record at tap time, then records the completed hand-off', async () => {
    const db = new VapeOffDatabase(`browser-backup-source-${crypto.randomUUID()}`)
    databases.push(db)
    await db.open()
    await db.meta.add({ key: 'installId', value: 'install-id' })
    await setMeta(db, 'lastBackupNagDismissedAt', 31)
    await db.puffSessions.add({
      id: 'session',
      at: '2026-08-28T12:00:00.000Z',
      lastTapAt: '2026-08-28T12:00:00.000Z',
      count: 2,
      logicalDay: '2026-08-28',
      tz: 'UTC',
    })
    await db.exports.add({
      id: 'previous-backup',
      at: '2026-08-27T12:00:00.000Z',
      logicalDay: '2026-08-27',
    })
    let handedFile: File | undefined
    const handOff = vi.fn(async (file: File) => {
      handedFile = file
      expect(await db.exports.count()).toBe(1)
      return 'shared' as const
    })
    const source = createBrowserBackupSource(
      db,
      {
        now: () => new Date('2026-08-29T12:34:56.789Z'),
        timeZone: () => 'UTC',
        randomUUID: () => 'current-backup',
        appBuild: { sha: 'abc1234', builtAt: '2026-08-29T08:00:00.000Z' },
      },
      handOff,
    )

    const loadedRecord = await source.load()
    const backingUp = source.backUp(loadedRecord)

    expect(handOff).toHaveBeenCalledOnce()
    const result = await backingUp

    expect(result).toEqual({ handoff: 'shared', fileName: 'vape-off-2026-08-29.json' })
    const envelope = JSON.parse(await readFile(handedFile!))
    expect(envelope.installId).toBe('install-id')
    expect(envelope.puffSessions).toHaveLength(1)
    expect(envelope.exports).toEqual([
      expect.objectContaining({ id: 'previous-backup' }),
    ])
    expect(envelope.exports).not.toContainEqual(
      expect.objectContaining({ id: 'current-backup' }),
    )
    await expect(db.exports.get('current-backup')).resolves.toEqual({
      id: 'current-backup',
      at: '2026-08-29T12:34:56.789+00:00',
      logicalDay: '2026-08-29',
    })
    await expect(getMeta(db, 'lastBackupNagDismissedAt')).resolves.toBe(0)
  })

  it('does not record an export when the hand-off fails', async () => {
    const db = new VapeOffDatabase(`browser-backup-source-${crypto.randomUUID()}`)
    databases.push(db)
    await db.open()
    await db.meta.add({ key: 'installId', value: 'install-id' })
    const source = createBrowserBackupSource(
      db,
      {
        now: () => new Date('2026-08-29T12:34:56.789Z'),
        timeZone: () => 'UTC',
        randomUUID: () => 'failed-backup',
        appBuild: { sha: 'abc1234', builtAt: '2026-08-29T08:00:00.000Z' },
      },
      vi.fn().mockRejectedValue(new DOMException('Cancelled', 'AbortError')),
    )

    const loadedRecord = await source.load()
    await expect(source.backUp(loadedRecord)).rejects.toMatchObject({ name: 'AbortError' })
    await expect(db.exports.count()).resolves.toBe(0)
  })
})
