import { buildIdentity, type BuildIdentity } from '../shell/build-identity.ts'
import { SCHEMA_VERSION, VapeOffDatabase } from '../store/database.ts'
import { instantOf, logicalDayKeyOf } from '../store/logical-day.ts'
import { getOrCreateInstallId, setMeta } from '../store/meta.ts'
import { openDatabase } from '../store/open-database.ts'
import { evaluate } from '../store/ratchet-writes.ts'
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
}

export interface BrowserBackupEnvironment {
  now: () => Date
  timeZone: () => string
  randomUUID: () => string
  appBuild: BuildIdentity
}

const browserEnvironment: BrowserBackupEnvironment = {
  now: () => new Date(),
  timeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  randomUUID: () => crypto.randomUUID(),
  appBuild: buildIdentity,
}

export function knownLogicalDayCount(record: BackupRecord): number {
  return new Set([
    ...record.puffSessions.map((item) => item.logicalDay),
    ...record.resistedUrges.map((item) => item.logicalDay),
    ...record.clearDays.map((item) => item.logicalDay),
  ]).size
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
  db: VapeOffDatabase,
  environment: BrowserBackupEnvironment = browserEnvironment,
  handOff: (file: File) => Promise<BackupHandoff> = handOffBackup,
): BackupSource {
  let opening: Promise<void> | undefined

  async function ensureOpen(): Promise<void> {
    if (db.isOpen()) return
    opening ??= openDatabase(db, environment.randomUUID).then((result) => {
      if (result.status !== 'ok') throw new Error(`Database is ${result.status}`)
    })
    await opening
  }

  return {
    async load() {
      await ensureOpen()
      const [puffSessions, resistedUrges, clearDays, ratchetSteps, exports, installId] =
        await Promise.all([
          db.puffSessions.toArray(),
          db.resistedUrges.toArray(),
          db.clearDays.toArray(),
          db.ratchetSteps.toArray(),
          db.exports.toArray(),
          getOrCreateInstallId(db, environment.randomUUID),
        ])
      return { puffSessions, resistedUrges, clearDays, ratchetSteps, exports, installId }
    },

    async backUp(record) {
      const now = environment.now()
      const timeZone = environment.timeZone()
      const exportedAt = instantOf(now, timeZone)
      const backup = createBackupFile(record, {
        schemaVersion: SCHEMA_VERSION,
        appBuild: environment.appBuild,
        exportedAt,
        installId: record.installId,
      })

      // Calling handOff before the first await preserves the tap's user activation.
      const handingOff = handOff(backup.file)
      const handoff = await handingOff

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
      await ensureOpen()
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
      await evaluate(db, environment)
    },
  }
}

export const browserBackupSource = createBrowserBackupSource(new VapeOffDatabase())
