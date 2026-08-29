import type { VapeOffDatabase } from './database.ts'

export interface MetaValues {
  installId: string
  firstRunCardDismissed: boolean
  installWallBypassed: boolean
  lastBackupNagDismissedAt: number
}

export type MetaKey = keyof MetaValues

export async function getMeta<Key extends MetaKey>(
  db: VapeOffDatabase,
  key: Key,
): Promise<MetaValues[Key] | undefined> {
  const record = await db.meta.get(key)
  return record?.value as MetaValues[Key] | undefined
}

export async function setMeta<Key extends MetaKey>(
  db: VapeOffDatabase,
  key: Key,
  value: MetaValues[Key],
): Promise<void> {
  await db.meta.put({ key, value })
}

export function getOrCreateInstallId(
  db: VapeOffDatabase,
  createInstallId: () => string,
): Promise<string> {
  return db.transaction('rw', db.meta, async () => {
    const existing = await getMeta(db, 'installId')
    if (existing !== undefined) return existing

    const installId = createInstallId()
    await db.meta.add({ key: 'installId', value: installId })
    return installId
  })
}
