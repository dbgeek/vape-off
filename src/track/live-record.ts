import { useEffect, useMemo, useRef, useState } from 'react'
import type { Correction, CorrectionRefusal } from '../domain/corrections.ts'
import type { DayLedgerRecord } from '../domain/day-ledger.ts'
import { useReturnToView } from '../shell/return-to-view.ts'
import { buildTrackView, type TrackView } from './track-view.ts'
import type { TrackClock, TrackSource } from './TrackScreen.tsx'

/**
 * The record as it moves: what Track has been told, what it is being told now,
 * and the order those land in.
 *
 * Track already had a module for *reading* the record — `buildTrackView` turns
 * a record and an instant into everything the screen draws. It had none for
 * writing one, so the queue, the clock and the load lifecycle lived in the
 * screen among the markup, and the guarantee they exist for was a comment.
 * A comment is what it was when `restoreFrom` was added straight past it.
 *
 * **Every change to the record crosses one queue, in order** (ADR 0017). That
 * is the whole of what this module promises, and it is why a restore is a
 * member here rather than something the screen arranges for itself.
 *
 * The screen keeps what is genuinely its own: which dialog is open, and the
 * wording of anything that went wrong. This module names the outcome; it never
 * words it.
 */

const emptyRecord: DayLedgerRecord = {
  puffSessions: [],
  resistedUrges: [],
  clearDays: [],
  ratchetSteps: [],
}

export interface LiveRecord {
  /** The record itself, for the editor: it re-finds its session as this moves. */
  record: DayLedgerRecord
  /** Everything the screen draws, derived from the record and the instant together. */
  view: TrackView
  /** The instant the view is drawn against. Advances on a tick, on return, and on every write. */
  now: Date
  /** Writes still settling. Zero means the record on screen is the record in the store. */
  pending: number
  /** Whether the first read has come back. Distinct from an empty record. */
  loaded: boolean
  /** The record could not be read. */
  loadFailed: boolean
  /** A write could not be made — a different sentence from a read that failed. */
  writeFailed: boolean
  /** Why the record refused the last Correction, if it did. Worded by the screen. */
  correctionRefusal: CorrectionRefusal | undefined
  /** Whether the greeting has been claimed, by a write or by being dismissed. */
  greetingDismissed: boolean

  logPuff: () => void
  logResistedUrge: () => void
  toggleKick: (id: string) => void
  /** `at` names a past Logical Day for a catch-up; omitted, it means now. */
  declareClearDay: (at?: Date) => void
  correct: (correction: Correction) => void
  declareHandover: () => void
  /**
   * A restore, taking its turn.
   *
   * It is handed the caller's completion rather than a file, so the Backup's own
   * lifecycle — parsing, refusing, wording its errors — stays where it already
   * lives and this module never learns what a Backup is. What it does own is the
   * ordering: a restore replaces the whole history, so a tap still settling must
   * not land in a record about to be discarded, nor after one that just replaced
   * it (ADR 0017).
   */
  restore: (complete: () => Promise<boolean>) => Promise<void>
  dismissGreeting: () => void
}

export function useLiveRecord(source: TrackSource, clock: TrackClock): LiveRecord {
  const [record, setRecord] = useState<DayLedgerRecord>(emptyRecord)
  const [now, setNow] = useState(clock.now)
  const [pending, setPending] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [writeFailed, setWriteFailed] = useState(false)
  const [correctionRefusal, setCorrectionRefusal] = useState<CorrectionRefusal>()
  const [greetingDismissed, setGreetingDismissed] = useState(true)

  const queue = useRef<Promise<void>>(Promise.resolve())
  const live = useRef(true)
  const timeZone = clock.timeZone()

  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])

  /**
   * One change at a time, in order (ADR 0017).
   *
   * An operation answering with no record has already said so for itself —
   * nothing to set, and not a failure. An operation that throws is a failed
   * write, which is not the same event as a record that could not be read.
   */
  function submit(operation: () => Promise<DayLedgerRecord | undefined>, at: Date): void {
    setPending((count) => count + 1)
    queue.current = queue.current.then(async () => {
      try {
        const written = await operation()
        if (!live.current) return
        if (written !== undefined) {
          setRecord(written)
          // A write claims the greeting. The flag lives in `meta` rather than in
          // the record, so the write cannot answer for it — but every Track
          // write claims it in the store except `toggleKick`, which can only
          // reach a Puff Session that claimed it when it was written.
          setGreetingDismissed(true)
          setNow(at)
        }
        setWriteFailed(false)
      } catch {
        if (live.current) setWriteFailed(true)
      } finally {
        if (live.current) setPending((count) => count - 1)
      }
    })
  }

  /** Reads the record back, behind whatever is already in flight. */
  function queueReload(): void {
    queue.current = queue.current.then(async () => {
      try {
        const refreshed = await source.load()
        if (live.current) setRecord(refreshed)
      } catch {
        if (live.current) setLoadFailed(true)
      }
    })
  }

  useEffect(() => {
    Promise.all([source.load(), source.loadFirstRunCardDismissed()]).then(
      ([loadedRecord, claimed]) => {
        if (!live.current) return
        setRecord(loadedRecord)
        setGreetingDismissed(claimed)
        setLoaded(true)
      },
      () => {
        if (live.current) setLoadFailed(true)
      },
    )
  }, [source])

  // The Logical Day moves under the reader whether or not they touch anything:
  // the now-line travels, Pace re-spreads, and at 04:00 the day itself turns.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(clock.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [clock])

  // The Ratchet evaluates on every cold start and on every return to view: an
  // app parked in the switcher for days wakes with a stale Target and a stale
  // badge until something is written.
  useReturnToView(() => {
    setNow(clock.now())
    queueReload()
  })

  const view = useMemo(() => buildTrackView(record, now, timeZone), [record, now, timeZone])

  return {
    record,
    view,
    now,
    pending,
    loaded,
    loadFailed,
    writeFailed,
    correctionRefusal,
    greetingDismissed,

    logPuff() {
      const at = clock.now()
      submit(() => source.logPuff(at), at)
    },

    logResistedUrge() {
      const at = clock.now()
      submit(() => source.logResistedUrge(at), at)
    },

    // Marking goes through the same queue as everything else, so a Kick and a
    // `PUFF` landing together stay in the order they were made.
    toggleKick(id) {
      const at = clock.now()
      submit(() => source.toggleKick(id, at), at)
    },

    declareClearDay(at) {
      const now = clock.now()
      submit(() => source.declareClearDay(at ?? now), now)
    },

    /**
     * A Correction the reader confirmed. The editor has already refused anything
     * the record cannot hold, so a refusal here is a backstop — but a silent one
     * would read as a tap that did nothing, and the dialog has already closed.
     */
    correct(correction) {
      const at = clock.now()
      submit(async () => {
        const written = await source.correct(correction)
        if (written.status === 'refused') {
          if (live.current) setCorrectionRefusal(written.reason)
          return undefined
        }
        if (live.current) setCorrectionRefusal(undefined)
        return written.record
      }, at)
    },

    declareHandover() {
      const at = clock.now()
      submit(() => source.declareHandover(), at)
    },

    async restore(complete) {
      const at = clock.now()
      let replaced = false
      submit(async () => {
        replaced = await complete()
        if (!replaced) return undefined
        setGreetingDismissed(true)
        return source.load()
      }, at)
      await queue.current
    },

    dismissGreeting() {
      setGreetingDismissed(true)
      void source.dismissFirstRunCard().catch(() => {
        if (live.current) setWriteFailed(true)
      })
    },
  }
}
