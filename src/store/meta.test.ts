import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { VapeOffDatabase } from './database.ts'
import { getMeta, setMeta } from './meta.ts'

const databases: VapeOffDatabase[] = []

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.delete()))
})

describe('meta accessors', () => {
  it('reads and updates store metadata by its typed key', async () => {
    const db = new VapeOffDatabase(`meta-test-${crypto.randomUUID()}`)
    databases.push(db)

    await expect(getMeta(db, 'firstRunCardDismissed')).resolves.toBeUndefined()
    await setMeta(db, 'firstRunCardDismissed', true)
    await expect(getMeta(db, 'firstRunCardDismissed')).resolves.toBe(true)
    await setMeta(db, 'firstRunCardDismissed', false)
    await expect(getMeta(db, 'firstRunCardDismissed')).resolves.toBe(false)
  })
})
