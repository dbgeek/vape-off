import { useEffect, useMemo, useRef, useState } from 'react'
import {
  browserBackupSource,
  type BackupSource,
} from '../backup/browser-backup-source.ts'
import { useRestore } from '../backup/use-restore.ts'
import {
  applyCorrection,
  type Correction,
  type CorrectionRefusal,
} from '../domain/corrections.ts'
import type { DayLedgerRecord } from '../domain/day-ledger.ts'
import {
  dateTimeInputValue,
  deviceTimeZone,
  formatLogicalDayWithWeekday,
  formatWallTime,
  instantFromDateTimeInput,
} from '../domain/logical-day.ts'
import { momentum } from '../domain/readouts.ts'
import { isStandalone } from '../shell/install-state.ts'
import type { LogicalDayKey, PuffSession, ResistedUrge } from '../store/records.ts'
import { markSize, timelinePosition } from './timeline-geometry.ts'
import { buildTrackView } from './track-view.ts'

const emptyRecord: DayLedgerRecord = {
  puffSessions: [],
  resistedUrges: [],
  clearDays: [],
  ratchetSteps: [],
}

/** A Correction the record accepted, or the reason it could not hold it. */
export type CorrectionResult =
  | { status: 'corrected'; record: DayLedgerRecord }
  | { status: 'refused'; reason: CorrectionRefusal }

export interface TrackSource {
  load: () => Promise<DayLedgerRecord>
  loadFirstRunCardDismissed: () => Promise<boolean>
  logPuff: (at: Date) => Promise<DayLedgerRecord>
  logResistedUrge: (at: Date) => Promise<DayLedgerRecord>
  dismissFirstRunCard: () => Promise<void>
  declareClearDay: (at: Date) => Promise<DayLedgerRecord>
  /** Every Correction, described once and carried whole. */
  correct: (correction: Correction) => Promise<CorrectionResult>
  declareHandover: () => Promise<DayLedgerRecord>
}

export interface TrackClock {
  now: () => Date
  timeZone: () => string
}

const browserClock: TrackClock = {
  now: () => new Date(),
  timeZone: () => deviceTimeZone(),
}

function puffLabel(session: PuffSession, timeZone: string): string {
  const unit = session.count === 1 ? 'puff' : 'puffs'
  return `Puff Session, ${session.count} ${unit} at ${formatWallTime(session.at, timeZone)}`
}

function dateAtNoon(logicalDay: LogicalDayKey): Date {
  return new Date(`${logicalDay}T12:00:00`)
}

const REFUSAL_MESSAGES: Record<CorrectionRefusal, string> = {
  'count-below-one': 'Enter a whole puff count of at least 1.',
  'in-the-future': 'Choose a time that has already happened.',
}

type EditorState =
  | { kind: 'puff'; session: PuffSession }
  | { kind: 'urge'; urge: ResistedUrge }
  | { kind: 'new'; at: Date }

function RecordEditor({
  editor,
  record,
  today,
  timeZone,
  now,
  correct,
  close,
}: {
  editor: EditorState
  record: DayLedgerRecord
  today: LogicalDayKey
  timeZone: string
  now: Date
  correct: (correction: Correction) => void
  close: () => void
}) {
  const [eventKind, setEventKind] = useState<'puff' | 'urge'>(
    editor.kind === 'urge' ? 'urge' : 'puff',
  )
  const initialAt = editor.kind === 'new' ? editor.at : new Date(editor.kind === 'puff' ? editor.session.at : editor.urge.at)
  const [at, setAt] = useState(dateTimeInputValue(initialAt, timeZone))
  const [count, setCount] = useState(editor.kind === 'puff' ? String(editor.session.count) : '1')
  const [confirmation, setConfirmation] = useState<{
    before: number
    after: number
    apply: () => void
  }>()
  const [validationError, setValidationError] = useState<string>()
  const title =
    editor.kind === 'puff'
      ? 'Edit Puff Session'
      : editor.kind === 'urge'
        ? 'Edit Resisted Urge'
        : 'Add to the record'

  /**
   * Show what the Correction would do to Momentum before making it, and say so
   * when it moves (ADR 0011). The record it is measured against is the one the
   * Correction module produces, so the number named here is the one the write
   * lands on.
   */
  function propose(correction: Correction) {
    setValidationError(undefined)
    const corrected = applyCorrection(record, correction, now, timeZone)
    if (corrected.status === 'refused') {
      setValidationError(REFUSAL_MESSAGES[corrected.reason])
      return
    }

    const apply = () => {
      correct(correction)
      close()
    }
    const before = momentum(record, today)
    const after = momentum(corrected.record, today)
    if (before === after) {
      apply()
      return
    }
    setConfirmation({ before, after, apply })
  }

  function save() {
    setValidationError(undefined)
    let editedAt: Date
    try {
      editedAt = instantFromDateTimeInput(at, timeZone)
    } catch {
      setValidationError('Enter a date and time.')
      return
    }
    const parsedCount = Number(count)

    if (editor.kind === 'puff') {
      propose({
        kind: 'update-puff-session',
        id: editor.session.id,
        at: editedAt,
        count: parsedCount,
      })
    } else if (editor.kind === 'urge') {
      propose({ kind: 'update-resisted-urge', id: editor.urge.id, at: editedAt })
    } else if (eventKind === 'puff') {
      propose({ kind: 'add-puff-session', at: editedAt, count: parsedCount })
    } else {
      propose({ kind: 'add-resisted-urge', at: editedAt })
    }
  }

  function remove() {
    if (editor.kind === 'puff') {
      propose({ kind: 'delete-puff-session', id: editor.session.id })
    }
    if (editor.kind === 'urge') {
      propose({ kind: 'delete-resisted-urge', id: editor.urge.id })
    }
  }

  return (
    <section className="record-editor" role="dialog" aria-modal="true" aria-labelledby="record-editor-title">
      <div className="record-editor-head">
        <h2 id="record-editor-title">{title}</h2>
        <button type="button" onClick={close} aria-label="Close editor">×</button>
      </div>
      {editor.kind === 'new' ? (
        <label>
          Event
          <select value={eventKind} onChange={(event) => setEventKind(event.target.value as 'puff' | 'urge')}>
            <option value="puff">Puff Session</option>
            <option value="urge">Resisted Urge</option>
          </select>
        </label>
      ) : null}
      <label>
        Time
        <input
          type="datetime-local"
          max={dateTimeInputValue(now, timeZone)}
          value={at}
          onChange={(event) => setAt(event.target.value)}
        />
      </label>
      {(editor.kind === 'puff' || (editor.kind === 'new' && eventKind === 'puff')) ? (
        <label>
          Puff count
          <input min="1" step="1" type="number" value={count} onChange={(event) => setCount(event.target.value)} />
        </label>
      ) : null}
      <div className="record-editor-actions">
        {editor.kind !== 'new' ? <button type="button" className="delete-action" onClick={remove}>Delete</button> : null}
        <button type="button" className="primary-action" onClick={save}>Save changes</button>
      </div>
      {validationError ? <p className="record-editor-error" role="alert">{validationError}</p> : null}
      {confirmation ? (
        <div className="momentum-confirmation" role="alertdialog" aria-label="Momentum change">
          <p>This will change your momentum from {confirmation.before} to {confirmation.after}.</p>
          <div>
            <button type="button" onClick={() => setConfirmation(undefined)}>Keep editing</button>
            <button type="button" className="primary-action" onClick={confirmation.apply}>Apply change</button>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export function TrackScreen({
  source,
  backupSource = browserBackupSource,
  clock = browserClock,
  installed = isStandalone(),
  forceInstallBar = false,
}: {
  source: TrackSource
  backupSource?: BackupSource
  clock?: TrackClock
  installed?: boolean
  forceInstallBar?: boolean
}) {
  const [record, setRecord] = useState<DayLedgerRecord>(emptyRecord)
  const [now, setNow] = useState(clock.now)
  const [pendingWrites, setPendingWrites] = useState(0)
  const [loadFailed, setLoadFailed] = useState(false)
  const [correctionError, setCorrectionError] = useState<string>()
  const [loaded, setLoaded] = useState(false)
  const [firstRunCardDismissed, setFirstRunCardDismissed] = useState(true)
  const [restoreDoorOpen, setRestoreDoorOpen] = useState(false)
  const [editor, setEditor] = useState<EditorState>()
  const writeQueue = useRef<Promise<void>>(Promise.resolve())
  const timeZone = clock.timeZone()
  const {
    completeRestore,
    prepareRestore,
    restoring,
    restoreError,
    restoreMessage,
  } = useRestore(backupSource, source.dismissFirstRunCard)

  useEffect(() => {
    let live = true
    Promise.all([source.load(), source.loadFirstRunCardDismissed()]).then(
      ([loadedRecord, cardDismissed]) => {
        if (live) {
          setRecord(loadedRecord)
          setFirstRunCardDismissed(cardDismissed)
          setLoaded(true)
        }
      },
      () => {
        if (live) setLoadFailed(true)
      },
    )
    // The Ratchet evaluates on every cold start and on every return to view: an
    // app parked in the switcher for days wakes with a stale Target and a stale
    // badge until something is written. The reload queues behind any in-flight
    // write so it cannot overwrite a record a tap is still producing.
    function refreshWhenVisible() {
      if (document.visibilityState !== 'visible') return
      setNow(clock.now())
      writeQueue.current = writeQueue.current.then(async () => {
        try {
          const refreshed = await source.load()
          if (live) setRecord(refreshed)
        } catch {
          if (live) setLoadFailed(true)
        }
      })
    }
    const timer = window.setInterval(() => setNow(clock.now()), 60_000)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      live = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [clock, source])

  const view = useMemo(
    () => buildTrackView(record, now, timeZone),
    [record, now, timeZone],
  )

  /**
   * Where the now-line is drawn — read off the same fixed axis as everything
   * else, so it travels down the screen through the day rather than sitting
   * pinned at the middle. It is a reading of the axis, not an input to it.
   */
  const nowPosition = timelinePosition(now, timeZone)

  /**
   * One write at a time, in order. An operation that returns no record has
   * already said so for itself — nothing to set, and not a failure.
   */
  function mutate(operation: () => Promise<DayLedgerRecord | undefined>, at = clock.now()) {
    setPendingWrites((count) => count + 1)
    writeQueue.current = writeQueue.current.then(async () => {
      try {
        const written = await operation()
        if (written === undefined) return
        setRecord(written)
        setFirstRunCardDismissed(true)
        setNow(at)
      } catch {
        setLoadFailed(true)
      } finally {
        setPendingWrites((count) => count - 1)
      }
    })
  }

  /**
   * A Correction the reader confirmed. `propose` has already refused anything
   * the record cannot hold, so a refusal here is a backstop — but a silent one
   * would read as a tap that did nothing, and the editor has already closed.
   */
  function correct(correction: Correction) {
    mutate(async () => {
      const written = await source.correct(correction)
      if (written.status === 'refused') {
        setCorrectionError(REFUSAL_MESSAGES[written.reason])
        return undefined
      }
      setCorrectionError(undefined)
      return written.record
    })
  }

  async function restoreFrom(file: File) {
    const candidate = await prepareRestore(file)
    if (candidate !== undefined && await completeRestore(candidate)) {
      setRecord(await source.load())
      setFirstRunCardDismissed(true)
    }
  }

  function write(operation: (at: Date) => Promise<DayLedgerRecord>) {
    const at = clock.now()
    mutate(() => operation(at), at)
  }

  function dismissFirstRunCard() {
    setFirstRunCardDismissed(true)
    void source.dismissFirstRunCard().catch(() => setLoadFailed(true))
  }

  return (
    <main className="track-screen" aria-busy={pendingWrites > 0 || undefined}>
      <header className="track-header">
        <div>
          <p className="track-kicker">Logical Day</p>
          <h1>Track</h1>
        </div>
        <output className="track-count" aria-label="Puffs today">
          {view.target === undefined ? view.total : `${view.total} / ${view.target}`}
        </output>
      </header>

      {loadFailed ? <p className="track-load-error">Track could not read your record.</p> : null}
      {correctionError ? <p className="track-load-error" role="alert">{correctionError}</p> : null}

      {!installed && (forceInstallBar || view.hasHistory || restoreDoorOpen) ? (
        <aside className="install-bar" aria-label="Install vape-off">
          <strong>Install vape-off</strong>
          <span>Share → Add to Home Screen. Keep this tab open until the icon appears.</span>
        </aside>
      ) : null}

      {view.catchUpDays.length > 0 ? (
        <section className="catch-up-strip" aria-label="Catch up">
          <div className="catch-up-copy">
            <strong>Anything you remember?</strong>
            <span>It is fine to leave a day unknown.</span>
          </div>
          <div className="catch-up-days">
            {view.catchUpDays.map((logicalDay) => (
              <article key={logicalDay} className="catch-up-day">
                <time dateTime={logicalDay}>{formatLogicalDayWithWeekday(logicalDay)}</time>
                <button type="button" onClick={() => setEditor({ kind: 'new', at: dateAtNoon(logicalDay) })}>
                  Add what I remember
                </button>
                <button type="button" onClick={() => mutate(() => source.declareClearDay(dateAtNoon(logicalDay)))}>
                  Clear Day
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="timeline" aria-label="Logical Day timeline">
        <span className="track-boundary-start">04:00</span>
        <div className="timeline-axis" aria-hidden="true" />
        <span className="track-boundary-end">04:00</span>

        {/* The hours below `now` have not happened yet, and the reader has to
          * know which content is real. Tone only: it sits behind everything and
          * moves nothing (`screens.md` § The axis). */}
        <div className="timeline-unlived" aria-hidden="true" style={{ top: `${nowPosition}%` }} />

        <div className="now-line" style={{ top: `${nowPosition}%` }}>
          <span>now</span>
          <time>{formatWallTime(now, timeZone)}</time>
        </div>

        {view.paceSlots.map((slot) => (
          <span
            key={slot}
            className="pace-slot"
            style={{ top: `${timelinePosition(slot, timeZone)}%` }}
            aria-label={`Pace slot at ${formatWallTime(slot, timeZone)}`}
          />
        ))}

        {view.targetReached ? (
          <div
            className="target-reached"
            style={{ top: `${timelinePosition(view.targetReached.at, timeZone)}%` }}
          >
            <span>Target reached {formatWallTime(view.targetReached.at, timeZone)}</span>
          </div>
        ) : null}

        {view.puffSessions.map((session) => {
          const size = markSize(session.count)
          return (
            <button
              type="button"
              key={session.id}
              className={`puff-mark${view.overTargetSessionIds.has(session.id) ? ' over-target' : ''}${view.openSession?.id === session.id ? ' open-mark' : ''}`}
              style={{
                top: `${timelinePosition(session.at, timeZone)}%`,
                width: `${size}px`,
                height: `${size}px`,
              }}
              aria-label={puffLabel(session, timeZone)}
              onClick={() => setEditor({ kind: 'puff', session })}
            >
              {session.count}
            </button>
          )
        })}

        {view.resistedUrges.map((urge) => (
          <button
            type="button"
            key={urge.id}
            className="resisted-mark"
            style={{ top: `${timelinePosition(urge.at, timeZone)}%` }}
            aria-label={`Resisted Urge at ${formatWallTime(urge.at, timeZone)}`}
            onClick={() => setEditor({ kind: 'urge', urge })}
          />
        ))}
      </section>

      <div className="track-offers">
        {!view.todayIsClear && view.puffSessions.length === 0 ? (
          <button type="button" onClick={() => mutate(() => source.declareClearDay(clock.now()))}>
            Declare today a Clear Day
          </button>
        ) : null}
        <button type="button" onClick={() => setEditor({ kind: 'new', at: clock.now() })}>
          Add past event
        </button>
      </div>

      {view.handoverAvailable ? (
        <aside className="handover-offer">
          <div><strong>You have held Target 1.</strong><span>The final step is yours.</span></div>
          <button type="button" onClick={() => mutate(source.declareHandover)}>Set Target to 0</button>
        </aside>
      ) : null}

      {view.openSession ? (
        <output className="open-session" aria-live="polite">
          <span className="open-session-pulse" aria-hidden="true" />
          Open session · {view.openSession.count} {view.openSession.count === 1 ? 'puff' : 'puffs'}
        </output>
      ) : null}

      <div className="track-actions">
        <button
          type="button"
          className="resisted-button"
          onClick={() => write(source.logResistedUrge)}
        >
          Resisted
        </button>
        <button
          type="button"
          className="puff-button"
          onClick={() => write(source.logPuff)}
        >
          {view.openSession ? `+1 → ${view.openSession.count + 1}` : 'PUFF'}
        </button>
      </div>

      {loaded && !view.hasHistory && !firstRunCardDismissed ? (
        <aside className="first-run-card">
          <button type="button" className="dismiss-card" aria-label="Dismiss welcome" onClick={dismissFirstRunCard}>×</button>
          <p>The first week just measures. Log every time you pick it up. After seven days of logging, vape-off sets your first daily target and starts bringing it down.</p>
          <div className="restore-door">
            <span>Used vape-off before?</span>
            <button type="button" onClick={() => setRestoreDoorOpen((open) => !open)}>Restore from a backup</button>
          </div>
          {restoreDoorOpen ? (
            <div className="restore-account">
              <p>Your history may be in a backup file. It may also be behind a <strong>second icon</strong> — check your Home Screen and App Library, open it, export from there, and come back.</p>
              <p>The other icon has to still exist. If you deleted it, its history went with it, and only a backup file will bring it back.</p>
              {!installed ? (
                <p className="restore-refused">Install vape-off before restoring. Use the install bar above.</p>
              ) : (
                <label className="first-run-restore-picker">
                  Choose a backup file
                  <input
                    type="file"
                    accept="application/json,.json"
                    disabled={restoring}
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0]
                      event.currentTarget.value = ''
                      if (file) void restoreFrom(file)
                    }}
                  />
                </label>
              )}
              {restoreError ? <p role="alert">{restoreError}</p> : null}
            </div>
          ) : null}
        </aside>
      ) : null}

      {restoreMessage ? <p className="restore-toast" aria-live="polite">{restoreMessage}</p> : null}

      {editor ? (
        <RecordEditor
          editor={editor}
          record={record}
          today={view.today}
          timeZone={timeZone}
          now={now}
          correct={correct}
          close={() => setEditor(undefined)}
        />
      ) : null}
    </main>
  )
}
