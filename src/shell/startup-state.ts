import { VapeOffDatabase } from '../store/database.ts'
import { browserDatabase } from '../store/browser-database.ts'
import { getMeta, setMeta } from '../store/meta.ts'
import { openDatabase } from '../store/open-database.ts'

export type ShellState =
  | { status: 'ready'; hasHistory: boolean; installWallBypassed: boolean }
  | { status: 'failed-open'; error: unknown }
  | { status: 'older-than-data'; databaseVersion: number; schemaVersion: number }

export interface StartupSource {
  load: () => Promise<ShellState>
  continueAnyway: () => Promise<void>
}

export function createStartupSource(
  database: VapeOffDatabase,
  createInstallId: () => string = () => crypto.randomUUID(),
): StartupSource {
  return {
    async load() {
      const opened = await openDatabase(database, createInstallId)
      if (opened.status !== 'ok') return opened

      try {
        const [recordCounts, installWallBypassed] = await Promise.all([
          Promise.all([
            database.puffSessions.count(),
            database.resistedUrges.count(),
            database.clearDays.count(),
            database.ratchetSteps.count(),
          ]),
          getMeta(database, 'installWallBypassed'),
        ])

        return {
          status: 'ready',
          hasHistory: recordCounts.some((count) => count > 0),
          installWallBypassed: installWallBypassed ?? false,
        }
      } catch (error) {
        database.close()
        return { status: 'failed-open', error }
      }
    },

    async continueAnyway() {
      await setMeta(database, 'installWallBypassed', true)
    },
  }
}

export const browserStartupSource = createStartupSource(browserDatabase)
