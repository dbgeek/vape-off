import { SCHEMA_VERSION, type VapeOffDatabase } from './database.ts'
import { getOrCreateInstallId } from './meta.ts'

export type OpenDatabaseResult =
  | { status: 'ok'; database: VapeOffDatabase; installId: string }
  | { status: 'failed-open'; error: unknown }
  | { status: 'older-than-data'; databaseVersion: number; schemaVersion: number }

export async function openDatabase(
  database: VapeOffDatabase,
  createInstallId: () => string = () => crypto.randomUUID(),
): Promise<OpenDatabaseResult> {
  let openError: unknown
  let opened = false

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await database.open()
      opened = true
      break
    } catch (error) {
      openError = error
    }
  }

  if (!opened) return { status: 'failed-open', error: openError }

  const databaseVersion = (database.backendDB()?.version ?? SCHEMA_VERSION * 10) / 10
  if (databaseVersion > database.verno) {
    const schemaVersion = database.verno
    database.close()
    return { status: 'older-than-data', databaseVersion, schemaVersion }
  }

  try {
    const installId = await getOrCreateInstallId(database, createInstallId)
    return { status: 'ok', database, installId }
  } catch (error) {
    database.close()
    return { status: 'failed-open', error }
  }
}
