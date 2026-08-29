import { VapeOffDatabase } from '../store/database.ts'
import { browserDatabase } from '../store/browser-database.ts'
import { openDatabase } from '../store/open-database.ts'

export type ShellState =
  | { status: 'ready'; hasHistory: boolean }
  | { status: 'failed-open'; error: unknown }
  | { status: 'older-than-data'; databaseVersion: number; schemaVersion: number }

export interface StartupSource {
  load: () => Promise<ShellState>
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
        const recordCounts = await Promise.all([
          database.puffSessions.count(),
          database.resistedUrges.count(),
          database.clearDays.count(),
          database.ratchetSteps.count(),
        ])

        return {
          status: 'ready',
          hasHistory: recordCounts.some((count) => count > 0),
        }
      } catch (error) {
        database.close()
        return { status: 'failed-open', error }
      }
    },
  }
}

export const browserStartupSource = createStartupSource(browserDatabase)
