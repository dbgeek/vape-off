import { instantOf, logicalDayKeyOf } from '../domain/logical-day.ts'
import { buildIdentity, type BuildIdentity } from '../shell/build-identity.ts'
import { SCHEMA_VERSION, type VapeOffDatabase } from '../store/database.ts'
import { getOrCreateInstallId, setMeta } from '../store/meta.ts'
import { browserSession, type StoreSession } from '../store/session.ts'
import type { BackupRecord } from './backup-file.ts'
import { createBackupFile, parseBackupFile } from './backup-file.ts'
import { handOffBackup, type BackupHandoff } from './browser-handoff.ts'

export interface LoadedBackupRecord extends BackupRecord {
  installId: string
}

export interface BackupResult {
  handoff: BackupHandoff
  fileName: string
}

export interface PreparedRestore {
  installId: string
  logicalDayCount: number
  record: BackupRecord
}

export interface BackupSource {
  load: () => Promise<LoadedBackupRecord>
  backUp: (record: LoadedBackupRecord) => Promise<BackupResult>
  prepareRestore: (file: File) => Promise<PreparedRestore>
  restore: (candidate: PreparedRestore) => Promise<void>
  recover: (candidate: PreparedRestore) => Promise<void>
}

export function knownLogicalDayCount(record: BackupRecord): number {
  return new Set([
    ...record.puffSessions.map((item) => item.logicalDay),
    ...record.resistedUrges.map((item) => item.logicalDay),
    ...record.clearDays.map((item) => item.logicalDay),
  ]).size
}

export function hasHistoryToReplace(record: BackupRecord): boolean {
  return record.puffSessions.length > 0
    || record.resistedUrges.length > 0
    || record.clearDays.length > 0
    || record.ratchetSteps.length > 0
    || record.exports.length > 0
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(String(reader.result)))
    reader.addEventListener('error', () => reject(reader.error))
    reader.readAsText(file)
  })
}

export function createBrowserBackupSource(
  session: StoreSession,
  appBuild: BuildIdentity = buildIdentity,
  handOff: (file: File) => Promise<BackupHandoff> = handOffBackup,
): BackupSource {
  const { environment } = session

  /**
   * The restore itself, as the session's write runs it — so the Ratchet's
   * evaluation and the badge follow it the way they follow any other write,
   * rather than being remembered here.
   */
  async function replaceRecord(db: VapeOffDatabase, candidate: PreparedRestore): Promise<void> {
    const now = environment.now()
    const timeZone = environment.timeZone()
    await db.transaction(
      'rw',
      db.puffSessions,
      db.resistedUrges,
      db.clearDays,
      db.ratchetSteps,
      db.exports,
      async () => {
        await Promise.all([
          db.puffSessions.clear(),
          db.resistedUrges.clear(),
          db.clearDays.clear(),
          db.ratchetSteps.clear(),
          db.exports.clear(),
        ])
        await Promise.all([
          db.puffSessions.bulkAdd([...candidate.record.puffSessions]),
          db.resistedUrges.bulkAdd([...candidate.record.resistedUrges]),
          db.clearDays.bulkAdd([...candidate.record.clearDays]),
          db.ratchetSteps.bulkAdd([...candidate.record.ratchetSteps]),
          db.exports.bulkAdd([...candidate.record.exports]),
        ])
        await db.exports.add({
          id: environment.randomUUID(),
          at: instantOf(now, timeZone),
          logicalDay: logicalDayKeyOf(now, timeZone),
          restoredFrom: candidate.installId,
        })
      },
    )
  }

  return {
    async load() {
      const record = await session.readRecord()
      const db = await session.database()
      const [exports, installId] = await Promise.all([
        db.exports.toArray(),
        getOrCreateInstallId(db, environment.randomUUID),
      ])
      return { ...record, exports, installId }
    },

    async backUp(record) {
      const now = environment.now()
      const timeZone = environment.timeZone()
      const exportedAt = instantOf(now, timeZone)
      const backup = createBackupFile(record, {
        schemaVersion: SCHEMA_VERSION,
        appBuild,
        exportedAt,
        installId: record.installId,
      })

      // Calling handOff before the first await preserves the tap's user
      // activation — which is why the connection is asked for *after* it, and
      // not hoisted to the top of the method with the other setup.
      const handingOff = handOff(backup.file)
      const handoff = await handingOff

      const db = await session.database()
      await db.transaction('rw', db.exports, db.meta, async () => {
        await db.exports.add({
          id: environment.randomUUID(),
          at: exportedAt,
          logicalDay: logicalDayKeyOf(now, timeZone),
        })
        await setMeta(db, 'lastBackupNagDismissedAt', 0)
      })

      return { handoff, fileName: backup.name }
    },

    async prepareRestore(file) {
      const parsed = parseBackupFile(await readFile(file))
      return {
        ...parsed,
        logicalDayCount: knownLogicalDayCount(parsed.record),
      }
    },

    async restore(candidate) {
      await session.write((db) => replaceRecord(db, candidate))
    },

    async recover(candidate) {
      await session.reset()
      await session.write((db) => replaceRecord(db, candidate))
    },
  }
}

export const browserBackupSource = createBrowserBackupSource(browserSession)
