import { buildIdentity, type BuildIdentity } from '../shell/build-identity.ts'
import { SCHEMA_VERSION, VapeOffDatabase } from '../store/database.ts'
import { instantOf, logicalDayKeyOf } from '../store/logical-day.ts'
import { getOrCreateInstallId, setMeta } from '../store/meta.ts'
import { openDatabase } from '../store/open-database.ts'
import type { BackupRecord } from './backup-file.ts'
import { createBackupFile } from './backup-file.ts'
import { handOffBackup, type BackupHandoff } from './browser-handoff.ts'

export interface LoadedBackupRecord extends BackupRecord {
  installId: string
}

export interface BackupResult {
  handoff: BackupHandoff
  fileName: string
}

export interface BackupSource {
  load: () => Promise<LoadedBackupRecord>
  backUp: (record: LoadedBackupRecord) => Promise<BackupResult>
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
  }
}

export const browserBackupSource = createBrowserBackupSource(new VapeOffDatabase())
