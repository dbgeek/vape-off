import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { VapeOffDatabase } from './database.ts'
import { logicalDayKeyOf, stampEvent } from './logical-day.ts'

const databases: VapeOffDatabase[] = []

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.delete()))
})

describe('logicalDayKeyOf', () => {
  it('uses the previous date immediately before the 04:00 boundary', () => {
    expect(logicalDayKeyOf(new Date('2026-08-29T01:59:59.999Z'), 'Europe/Stockholm')).toBe(
      '2026-08-28',
    )
  })

  it('uses the current date at the 04:00 boundary', () => {
    expect(logicalDayKeyOf(new Date('2026-08-29T02:00:00.000Z'), 'Europe/Stockholm')).toBe(
      '2026-08-29',
    )
  })

  it('keeps the Logical Day stamped in the device zone when read in another zone', async () => {
    const db = new VapeOffDatabase(`logical-day-test-${crypto.randomUUID()}`)
    databases.push(db)
    const at = new Date('2026-08-29T02:30:00.000Z')
    const stamp = stampEvent(at, 'Europe/Stockholm')

    expect(stamp.at).toBe('2026-08-29T04:30:00.000+02:00')

    await db.resistedUrges.add({
      id: '79ae9e0b-dd6f-4e54-b3f7-77947eff8a0e',
      ...stamp,
    })

    const stored = await db.resistedUrges.get('79ae9e0b-dd6f-4e54-b3f7-77947eff8a0e')
    expect(stored).toMatchObject({ logicalDay: '2026-08-29', tz: 'Europe/Stockholm' })
    expect(logicalDayKeyOf(new Date(stored!.at), 'America/New_York')).toBe('2026-08-28')
  })
})
