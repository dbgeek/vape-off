import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMeta, setMeta } from '../store/meta.ts'
import { VapeOffDatabase } from '../store/database.ts'
import { createStoreSession, type SessionEnvironment } from '../store/session.ts'
import type { BackupRecord } from './backup-file.ts'
import { createBackupFile } from './backup-file.ts'
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

function backupFile(record: BackupRecord, installId = 'source-install'): File {
  return createBackupFile(record, {
    appBuild: { sha: 'abc1234', builtAt: '2026-08-01T08:00:00.000Z' },
    exportedAt: '2026-08-01T12:00:00.000+00:00',
    installId,
    schemaVersion: 99,
  }).file
}

/**
 * A session whose badge is a no-op, for the tests that are not about the badge.
 *
 * Backup *does* badge — a read leaves the badge agreeing with the record
 * (ADR 0016), and a restore is the moment that matters most — so the tests that
 * care supply a badge of their own rather than coming through here.
 */
function sessionFor(db: VapeOffDatabase, environment: Omit<SessionEnvironment, 'badge'>) {
  return createStoreSession(db, { ...environment, badge: {} })
}

const appBuild = { sha: 'abc1234', builtAt: '2026-08-29T08:00:00.000Z' }

const emptyRecord: BackupRecord = {
  puffSessions: [],
  resistedUrges: [],
  clearDays: [],
  ratchetSteps: [],
  exports: [],
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
      sessionFor(db, {
        now: () => new Date('2026-08-29T12:34:56.789Z'),
        timeZone: () => 'UTC',
        randomUUID: () => 'current-backup',
      }),
      appBuild,
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
      sessionFor(db, {
        now: () => new Date('2026-08-29T12:34:56.789Z'),
        timeZone: () => 'UTC',
        randomUUID: () => 'failed-backup',
      }),
      appBuild,
      vi.fn().mockRejectedValue(new DOMException('Cancelled', 'AbortError')),
    )

    const loadedRecord = await source.load()
    await expect(source.backUp(loadedRecord)).rejects.toMatchObject({ name: 'AbortError' })
    await expect(db.exports.count()).resolves.toBe(0)
  })

  it('prepares and repairs the whole file in memory before opening the database', async () => {
    const db = new VapeOffDatabase(`browser-restore-source-${crypto.randomUUID()}`)
    databases.push(db)
    const source = createBrowserBackupSource(createStoreSession(db))
    const record: BackupRecord = {
      ...emptyRecord,
      puffSessions: [{
        id: 'session',
        at: '2026-08-01T12:00:00.000Z',
        lastTapAt: '2026-08-01T12:00:00.000Z',
        count: 2,
        logicalDay: '2026-08-01',
        tz: 'UTC',
      }],
      clearDays: [{
        logicalDay: '2026-08-01',
        at: '2026-08-01T20:00:00.000Z',
        tz: 'UTC',
      }],
    }

    const prepared = await source.prepareRestore(backupFile(record))

    expect(db.isOpen()).toBe(false)
    expect(prepared.logicalDayCount).toBe(1)
    expect(prepared.record.clearDays).toEqual([])
  })

  it('replaces all five history stores atomically, preserves meta, records the source, and evaluates', async () => {
    const db = new VapeOffDatabase(`browser-restore-source-${crypto.randomUUID()}`)
    databases.push(db)
    await db.open()
    await db.meta.bulkAdd([
      { key: 'installId', value: 'destination-install' },
      { key: 'firstRunCardDismissed', value: false },
    ])
    await db.puffSessions.add({
      id: 'old-session',
      at: '2026-08-28T12:00:00.000Z',
      lastTapAt: '2026-08-28T12:00:00.000Z',
      count: 9,
      logicalDay: '2026-08-28',
      tz: 'UTC',
    })
    const restored: BackupRecord = {
      ...emptyRecord,
      resistedUrges: [{
        id: 'restored-urge',
        at: '2026-08-01T12:00:00.000Z',
        logicalDay: '2026-08-01',
        tz: 'UTC',
      }],
      ratchetSteps: [{
        id: 'restored-step',
        effectiveFrom: '2026-08-01',
        target: 10,
        kind: 'earned',
        at: '2026-08-01T04:00:00.000Z',
      }],
    }
    const source = createBrowserBackupSource(sessionFor(db, {
      now: () => new Date('2026-08-29T12:00:00.000Z'),
      timeZone: () => 'UTC',
      randomUUID: () => 'restore-record',
    }))

    await source.restore(await source.prepareRestore(backupFile(restored)))

    await expect(db.puffSessions.toArray()).resolves.toEqual([])
    await expect(db.resistedUrges.toArray()).resolves.toEqual(restored.resistedUrges)
    await expect(db.clearDays.toArray()).resolves.toEqual([])
    await expect(db.ratchetSteps.toArray()).resolves.toEqual(restored.ratchetSteps)
    await expect(db.exports.toArray()).resolves.toEqual([{
      id: 'restore-record',
      at: '2026-08-29T12:00:00.000+00:00',
      logicalDay: '2026-08-29',
      restoredFrom: 'source-install',
    }])
    await expect(db.meta.orderBy('key').toArray()).resolves.toEqual([
      { key: 'firstRunCardDismissed', value: false },
      { key: 'installId', value: 'destination-install' },
    ])
  })

  /**
   * The moment the badge is most likely to be wrong and most likely to be
   * looked at: the record has just been replaced wholesale, and every derived
   * figure with it (ADR 0016).
   */
  it('leaves the badge agreeing with the record it restored, and with the one it reads', async () => {
    const db = new VapeOffDatabase(`browser-restore-badge-${crypto.randomUUID()}`)
    databases.push(db)
    await db.open()
    const badge = {
      setAppBadge: vi.fn().mockResolvedValue(undefined),
      clearAppBadge: vi.fn().mockResolvedValue(undefined),
    }
    const restored: BackupRecord = {
      ...emptyRecord,
      puffSessions: [{
        id: 'restored-session',
        at: '2026-08-29T09:00:00.000Z',
        lastTapAt: '2026-08-29T09:00:00.000Z',
        count: 4,
        logicalDay: '2026-08-29',
        tz: 'UTC',
      }],
      ratchetSteps: [{
        id: 'restored-step',
        effectiveFrom: '2026-08-01',
        target: 10,
        kind: 'earned',
        at: '2026-08-01T04:00:00.000Z',
      }],
    }
    const source = createBrowserBackupSource(createStoreSession(db, {
      now: () => new Date('2026-08-29T12:00:00.000Z'),
      timeZone: () => 'UTC',
      randomUUID: () => 'restore-record',
      badge,
    }))

    await source.restore(await source.prepareRestore(backupFile(restored)))

    // Target 10, four puffs on the restored day: six left, on the icon, without
    // waiting for a visit to Track or Stats.
    expect(badge.setAppBadge).toHaveBeenLastCalledWith(6)

    badge.setAppBadge.mockClear()
    await source.load()
    expect(badge.setAppBadge).toHaveBeenCalledWith(6)
  })

  it('rolls back the cleared stores when any restore insert fails', async () => {
    const db = new VapeOffDatabase(`browser-restore-source-${crypto.randomUUID()}`)
    databases.push(db)
    await db.open()
    await db.meta.add({ key: 'installId', value: 'destination-install' })
    await db.exports.add({
      id: 'old-export',
      at: '2026-08-28T12:00:00.000Z',
      logicalDay: '2026-08-28',
    })
    const source = createBrowserBackupSource(sessionFor(db, {
      now: () => new Date('2026-08-29T12:00:00.000Z'),
      timeZone: () => 'UTC',
      randomUUID: () => 'colliding-id',
    }))
    const candidate = await source.prepareRestore(backupFile({
      ...emptyRecord,
      exports: [{
        id: 'colliding-id',
        at: '2026-08-01T12:00:00.000Z',
        logicalDay: '2026-08-01',
      }],
    }))

    await expect(source.restore(candidate)).rejects.toThrow()

    await expect(db.exports.toArray()).resolves.toEqual([{
      id: 'old-export',
      at: '2026-08-28T12:00:00.000Z',
      logicalDay: '2026-08-28',
    }])
    await expect(getMeta(db, 'installId')).resolves.toBe('destination-install')
  })

  it('recovers a database that cannot be trusted only after the Backup is prepared', async () => {
    const db = new VapeOffDatabase(`browser-recovery-source-${crypto.randomUUID()}`)
    databases.push(db)
    await db.open()
    await db.meta.add({ key: 'installId', value: 'unreadable-install' })
    await db.puffSessions.add({
      id: 'unreadable-session',
      at: '2026-08-28T12:00:00.000Z',
      lastTapAt: '2026-08-28T12:00:00.000Z',
      count: 9,
      logicalDay: '2026-08-28',
      tz: 'UTC',
    })
    const source = createBrowserBackupSource(sessionFor(db, {
      now: () => new Date('2026-08-29T12:00:00.000Z'),
      timeZone: () => 'UTC',
      randomUUID: () => 'new-install',
    }))
    const candidate = await source.prepareRestore(backupFile({
      ...emptyRecord,
      clearDays: [{
        logicalDay: '2026-08-20',
        at: '2026-08-20T12:00:00.000Z',
        tz: 'UTC',
      }],
    }))

    await source.recover(candidate)

    await expect(db.puffSessions.toArray()).resolves.toEqual([])
    await expect(db.clearDays.toArray()).resolves.toEqual(candidate.record.clearDays)
    await expect(getMeta(db, 'installId')).resolves.toBe('new-install')
  })

  it('carries a Kick out through the export read and back in through the restore write', async () => {
    const kickedSession = {
      id: 'a-kicked-sitting',
      at: '2026-08-28T12:00:00.000+00:00',
      lastTapAt: '2026-08-28T12:02:00.000+00:00',
      count: 3,
      logicalDay: '2026-08-28',
      tz: 'UTC',
      kickMarkedAt: '2026-08-28T12:05:00.000+00:00',
    }
    const exporting = new VapeOffDatabase(`browser-kick-export-${crypto.randomUUID()}`)
    databases.push(exporting)
    await exporting.open()
    await exporting.puffSessions.add(kickedSession)
    const environment = {
      now: () => new Date('2026-08-29T12:00:00.000Z'),
      timeZone: () => 'UTC',
      randomUUID: () => 'export-record',
    }
    let handedOff: File | undefined
    const exportSource = createBrowserBackupSource(
      sessionFor(exporting, environment),
      appBuild,
      async (file) => {
        handedOff = file
        return 'shared'
      },
    )

    // The whole path the file takes: the store read, the export mapper, the
    // guard, and the restore write — none of which the type system watches,
    // because the field is optional the whole way.
    await exportSource.backUp(await exportSource.load())
    expect(handedOff).toBeDefined()

    const importing = new VapeOffDatabase(`browser-kick-import-${crypto.randomUUID()}`)
    databases.push(importing)
    const importSource = createBrowserBackupSource(sessionFor(importing, {
      ...environment,
      randomUUID: () => 'restore-record',
    }))

    await importSource.restore(await importSource.prepareRestore(handedOff!))

    await expect(importing.puffSessions.toArray()).resolves.toEqual([kickedSession])
  })
})
