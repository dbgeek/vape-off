import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VapeOffDatabase } from '../store/database.ts'
import { createBrowserStatsSource } from './browser-stats-source.ts'

const databases: VapeOffDatabase[] = []

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.delete()))
})

describe('browser Stats source', () => {
  it('reads the whole Stats record, persists backup-card dismissal, and writes a deliberate step-back', async () => {
    const db = new VapeOffDatabase(`browser-stats-source-${crypto.randomUUID()}`)
    databases.push(db)
    await db.open()
    await db.puffSessions.add({
      id: 'session',
      at: '2026-08-28T12:00:00.000Z',
      lastTapAt: '2026-08-28T12:00:00.000Z',
      count: 2,
      logicalDay: '2026-08-28',
      tz: 'UTC',
    })
    await db.ratchetSteps.add({
      id: 'zero',
      effectiveFrom: '2026-08-20',
      target: 0,
      kind: 'declared',
      at: '2026-08-20T04:00:00.000Z',
    })
    await db.exports.add({
      id: 'backup',
      at: '2026-08-27T12:00:00.000Z',
      logicalDay: '2026-08-27',
    })
    const badge = {
      setAppBadge: vi.fn().mockResolvedValue(undefined),
      clearAppBadge: vi.fn().mockResolvedValue(undefined),
    }
    const source = createBrowserStatsSource(db, {
      now: () => new Date('2026-08-29T12:00:00.000Z'),
      timeZone: () => 'UTC',
      randomUUID: () => 'step-back',
      badge,
    })

    await expect(source.load()).resolves.toMatchObject({
      record: { puffSessions: [{ id: 'session' }], ratchetSteps: [{ target: 0 }] },
      exports: [{ id: 'backup' }],
      backupCardDismissedAt: 0,
    })
    expect(badge.clearAppBadge).toHaveBeenCalled()

    await source.dismissBackupCard(31)
    await expect(source.load()).resolves.toMatchObject({ backupCardDismissedAt: 31 })

    const steppedBack = await source.declareStepBack()
    expect(steppedBack.record.ratchetSteps).toContainEqual(
      expect.objectContaining({ id: 'step-back', target: 1, kind: 'declared' }),
    )
    expect(badge.setAppBadge).toHaveBeenCalledWith(1)
  })
})
