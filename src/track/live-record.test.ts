import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DayLedgerRecord } from '../domain/day-ledger.ts'
import type { PuffSession } from '../store/records.ts'
import { useLiveRecord } from './live-record.ts'
import type { TrackClock, TrackSource } from './TrackScreen.tsx'

/**
 * The live record's own tests: the ordering guarantee, and what happens when a
 * write goes wrong.
 *
 * None of this was reachable before the module existed — the queue lived inside
 * `TrackScreen`, so the only way to ask it a question was to render a screen and
 * infer the answer from the DOM. Exactly one screen test did, and it could only
 * prove that two identical writes serialised.
 */

const emptyRecord: DayLedgerRecord = {
  puffSessions: [],
  resistedUrges: [],
  clearDays: [],
  ratchetSteps: [],
}

function session(id: string, count: number): PuffSession {
  return {
    id,
    at: '2026-08-29T12:00:00.000Z',
    lastTapAt: '2026-08-29T12:00:00.000Z',
    count,
    logicalDay: '2026-08-29',
    tz: 'UTC',
  }
}

function recordWith(...sessions: PuffSession[]): DayLedgerRecord {
  return { ...emptyRecord, puffSessions: sessions }
}

const clock: TrackClock = {
  now: () => new Date('2026-08-29T12:00:00.000Z'),
  timeZone: () => 'UTC',
}

/** A promise the test resolves when it chooses, so two writes can be in flight at once. */
function deferred<Value>() {
  let settle: (value: Value) => void = () => {}
  let fail: (reason: unknown) => void = () => {}
  const promise = new Promise<Value>((resolve, reject) => {
    settle = resolve
    fail = reject
  })
  return { promise, settle, fail }
}

/**
 * A `TrackSource` that records the order it was called in.
 *
 * `settled` is what every unstubbed write answers with, so a test only has to
 * say something about the calls it cares about.
 */
function sourceFor(overrides: Partial<TrackSource> = {}) {
  const calls: string[] = []
  const record = (name: string) => {
    calls.push(name)
    return Promise.resolve(emptyRecord)
  }
  const source: TrackSource = {
    load: () => record('load'),
    loadFirstRunCardDismissed: () => Promise.resolve(true),
    logPuff: () => record('logPuff'),
    logResistedUrge: () => record('logResistedUrge'),
    dismissFirstRunCard: () => Promise.resolve(),
    declareClearDay: () => record('declareClearDay'),
    correct: () => Promise.resolve({ status: 'corrected', record: emptyRecord }),
    toggleKick: () => record('toggleKick'),
    declareHandover: () => record('declareHandover'),
    ...overrides,
  }
  return { source, calls }
}

function renderLiveRecord(source: TrackSource) {
  return renderHook(() => useLiveRecord(source, clock))
}

describe('the live record', () => {
  it('reads the record and the greeting on mount', async () => {
    const { source } = sourceFor({
      load: () => Promise.resolve(recordWith(session('first', 3))),
      loadFirstRunCardDismissed: () => Promise.resolve(false),
    })
    const { result } = renderLiveRecord(source)

    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.record.puffSessions).toEqual([session('first', 3)])
    expect(result.current.greetingDismissed).toBe(false)
    expect(result.current.view.total).toBe(3)
  })

  /**
   * The case the screen could never ask about: two *different* writes, in
   * flight together. A Kick and a `PUFF` landing at once have to stay in the
   * order they were made, and the screen's one queue test only ever compared a
   * write against another of the same kind.
   */
  it('holds the order across different kinds of write', async () => {
    const puff = deferred<DayLedgerRecord>()
    const { source, calls } = sourceFor({
      logPuff: () => {
        calls.push('logPuff')
        return puff.promise
      },
    })
    const { result } = renderLiveRecord(source)
    await waitFor(() => expect(result.current.loaded).toBe(true))
    calls.length = 0

    act(() => {
      result.current.logPuff()
      result.current.toggleKick('first')
    })

    expect(result.current.pending).toBe(2)
    // The Kick is queued, not sent: the tap ahead of it has not come back. That
    // `calls` settles at exactly `['logPuff']` is the whole assertion — a queue
    // that let the Kick past would already show both.
    await waitFor(() => expect(calls).toEqual(['logPuff']))

    await act(async () => {
      puff.settle(emptyRecord)
      await puff.promise
    })

    await waitFor(() => expect(calls).toEqual(['logPuff', 'toggleKick']))
    await waitFor(() => expect(result.current.pending).toBe(0))
  })

  /**
   * The defect this module was built for. A restore replaces the whole history,
   * so a tap still settling must not land in a record about to be discarded —
   * nor after one that has just replaced it (ADR 0017).
   */
  it('makes a restore take its turn rather than jump the queue', async () => {
    const puff = deferred<DayLedgerRecord>()
    const { source, calls } = sourceFor({
      logPuff: () => {
        calls.push('logPuff')
        return puff.promise
      },
    })
    const { result } = renderLiveRecord(source)
    await waitFor(() => expect(result.current.loaded).toBe(true))
    calls.length = 0

    const complete = vi.fn(async () => {
      calls.push('restore')
      return true
    })

    act(() => {
      result.current.logPuff()
      void result.current.restore(complete)
    })

    expect(complete).not.toHaveBeenCalled()

    await act(async () => {
      puff.settle(emptyRecord)
      await puff.promise
    })

    await waitFor(() => expect(calls).toEqual(['logPuff', 'restore', 'load']))
  })

  it('leaves the record alone when a restore is abandoned', async () => {
    const { source, calls } = sourceFor({
      load: () => {
        calls.push('load')
        return Promise.resolve(recordWith(session('kept', 2)))
      },
    })
    const { result } = renderLiveRecord(source)
    await waitFor(() => expect(result.current.loaded).toBe(true))
    calls.length = 0

    await act(async () => {
      await result.current.restore(async () => false)
    })

    expect(calls).toEqual([])
    expect(result.current.record.puffSessions).toEqual([session('kept', 2)])
  })

  /**
   * A write that throws must not wedge everything behind it. The queue is one
   * promise chain, and an unhandled rejection in it would stop the app taking
   * taps until it was reloaded.
   */
  it('keeps taking writes after one of them fails, and says a write failed', async () => {
    const { source, calls } = sourceFor({
      logPuff: () => {
        calls.push('logPuff')
        return Promise.reject(new Error('the write did not land'))
      },
    })
    const { result } = renderLiveRecord(source)
    await waitFor(() => expect(result.current.loaded).toBe(true))
    calls.length = 0

    await act(async () => {
      result.current.logPuff()
      await Promise.resolve()
    })

    await waitFor(() => expect(result.current.writeFailed).toBe(true))
    // A failed *write* is not a record that could not be read.
    expect(result.current.loadFailed).toBe(false)
    await waitFor(() => expect(result.current.pending).toBe(0))

    await act(async () => {
      result.current.logResistedUrge()
      await Promise.resolve()
    })

    await waitFor(() => expect(calls).toEqual(['logPuff', 'logResistedUrge']))
    await waitFor(() => expect(result.current.writeFailed).toBe(false))
  })

  it('says a load failed when the first read does not come back', async () => {
    const { source } = sourceFor({
      load: () => Promise.reject(new Error('the record could not be read')),
    })
    const { result } = renderLiveRecord(source)

    await waitFor(() => expect(result.current.loadFailed).toBe(true))
    expect(result.current.writeFailed).toBe(false)
    expect(result.current.loaded).toBe(false)
  })

  it('surfaces a refused Correction as a reason, and words none of it', async () => {
    const { source } = sourceFor({
      correct: () => Promise.resolve({ status: 'refused', reason: 'in-the-future' }),
    })
    const { result } = renderLiveRecord(source)
    await waitFor(() => expect(result.current.loaded).toBe(true))

    await act(async () => {
      result.current.correct({ kind: 'add-resisted-urge', at: new Date() })
      await Promise.resolve()
    })

    await waitFor(() => expect(result.current.correctionRefusal).toBe('in-the-future'))
    // A refusal is the record declining, not the write failing.
    expect(result.current.writeFailed).toBe(false)
  })

  it('claims the greeting on a write, so the card cannot outlive the first tap', async () => {
    const { source } = sourceFor({
      loadFirstRunCardDismissed: () => Promise.resolve(false),
    })
    const { result } = renderLiveRecord(source)
    await waitFor(() => expect(result.current.greetingDismissed).toBe(false))

    await act(async () => {
      result.current.logPuff()
      await Promise.resolve()
    })

    await waitFor(() => expect(result.current.greetingDismissed).toBe(true))
  })
})
