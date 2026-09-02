import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VapeOffDatabase } from '../store/database.ts'
import { createStoreSession } from '../store/session.ts'
import { createBrowserTrackSource } from './browser-track-source.ts'
import type { CorrectionResult } from './TrackScreen.tsx'

const databases: VapeOffDatabase[] = []

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.delete()))
})

describe('browser Track source', () => {
  it('persists greeting dismissal on the first write and runs every record correction through the database', async () => {
    const db = new VapeOffDatabase(`browser-track-source-${crypto.randomUUID()}`)
    databases.push(db)
    const badge = {
      setAppBadge: vi.fn().mockResolvedValue(undefined),
      clearAppBadge: vi.fn().mockResolvedValue(undefined),
    }
    const source = createBrowserTrackSource(createStoreSession(db, {
      now: () => new Date('2026-08-29T12:00:00.000Z'),
      timeZone: () => 'UTC',
      randomUUID: () => crypto.randomUUID(),
      badge,
    }))

    await expect(source.loadFirstRunCardDismissed()).resolves.toBe(false)

    const withClearDay = await source.declareClearDay(new Date('2026-08-28T12:00:00.000Z'))
    expect(withClearDay.clearDays).toHaveLength(1)
    await expect(source.loadFirstRunCardDismissed()).resolves.toBe(true)

    const withSession = await source.correct({
      kind: 'add-puff-session',
      at: new Date('2026-08-28T13:00:00.000Z'),
      count: 2,
    })
    expect(withSession).toMatchObject({ status: 'corrected' })
    const added = withSession as Extract<CorrectionResult, { status: 'corrected' }>
    expect(added.record.clearDays).toEqual([])
    const puffSession = added.record.puffSessions[0]!

    const corrected = await source.correct({
      kind: 'update-puff-session',
      id: puffSession.id,
      at: new Date('2026-08-27T13:00:00.000Z'),
      count: 3,
    })
    expect(corrected).toMatchObject({
      status: 'corrected',
      record: { puffSessions: [{ logicalDay: '2026-08-27', count: 3 }] },
    })

    await expect(
      source.correct({ kind: 'delete-puff-session', id: puffSession.id }),
    ).resolves.toMatchObject({ status: 'corrected', record: { puffSessions: [] } })
    expect(badge.clearAppBadge).toHaveBeenCalled()
  })

  it('stores an explicit dismissal without inventing history', async () => {
    const db = new VapeOffDatabase(`browser-track-source-${crypto.randomUUID()}`)
    databases.push(db)
    const source = createBrowserTrackSource(createStoreSession(db, {
      now: () => new Date('2026-08-29T12:00:00.000Z'),
      timeZone: () => 'UTC',
      randomUUID: () => crypto.randomUUID(),
      badge: {},
    }))

    await source.dismissFirstRunCard()

    await expect(source.loadFirstRunCardDismissed()).resolves.toBe(true)
    await expect(source.load()).resolves.toMatchObject({
      puffSessions: [],
      resistedUrges: [],
      clearDays: [],
      ratchetSteps: [],
    })
  })

  it('judges a Correction against the session clock, so a future one never reaches the record', async () => {
    const db = new VapeOffDatabase(`browser-track-source-${crypto.randomUUID()}`)
    databases.push(db)
    const source = createBrowserTrackSource(createStoreSession(db, {
      now: () => new Date('2026-08-29T12:00:00.000Z'),
      timeZone: () => 'UTC',
      randomUUID: () => crypto.randomUUID(),
      badge: {},
    }))

    await expect(
      source.correct({
        kind: 'add-puff-session',
        at: new Date('2026-08-29T13:00:00.000Z'),
        count: 1,
      }),
    ).resolves.toEqual({ status: 'refused', reason: 'in-the-future' })
    await expect(db.puffSessions.toArray()).resolves.toEqual([])
  })

  it('marks and un-marks a Kick without closing the Merge Window it lands inside', async () => {
    const db = new VapeOffDatabase(`browser-track-source-${crypto.randomUUID()}`)
    databases.push(db)
    const source = createBrowserTrackSource(createStoreSession(db, {
      now: () => new Date('2026-08-29T19:00:00.000Z'),
      timeZone: () => 'UTC',
      randomUUID: () => crypto.randomUUID(),
      badge: {},
    }))

    const logged = await source.logPuff(new Date('2026-08-29T19:00:00.000Z'))
    const sitting = logged.puffSessions[0]!

    // The open mark is a mark like any other, and the window is keyed to taps:
    // marking leaves `lastTapAt` where the tap put it, so the next `PUFF` still
    // merges into the same sitting rather than starting a second one.
    const marked = await source.toggleKick(sitting.id, new Date('2026-08-29T19:00:20.000Z'))
    expect(marked.puffSessions).toEqual([
      { ...sitting, kickMarkedAt: '2026-08-29T19:00:20.000+00:00' },
    ])

    const merged = await source.logPuff(new Date('2026-08-29T19:00:40.000Z'))
    expect(merged.puffSessions).toEqual([
      {
        ...sitting,
        count: 2,
        lastTapAt: '2026-08-29T19:00:40.000+00:00',
        kickMarkedAt: '2026-08-29T19:00:20.000+00:00',
      },
    ])

    // And taking it back deletes the property rather than writing a `false`:
    // the app never asks whether a sitting delivered nothing (ADR 0015).
    const unmarked = await source.toggleKick(sitting.id, new Date('2026-08-29T19:01:00.000Z'))
    expect(unmarked.puffSessions[0]).not.toHaveProperty('kickMarkedAt')
  })
})
