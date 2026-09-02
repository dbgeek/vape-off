import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
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
import { Lane, LANE_AXES, LIVE_LANE } from './Lane.tsx'
import { isKicked, kickedClass, puffLabel, urgeLabel } from './lane-events.ts'
import { useMarkGesture } from './mark-gesture.ts'
import { useMeasuredBox } from './measured-box.ts'
import { timelinePosition } from './timeline-geometry.ts'
import { buildTrackView } from './track-view.ts'
import { YesterdayLane } from './YesterdayLane.tsx'

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
  /**
   * Marking a Kick, and taking it back — one toggle, whichever route reached it.
   *
   * Beside the Correction rather than inside it: marking fills the record's
   * silence about what a sitting gave you rather than changing what it says
   * happened, so nothing is proposed and no derived figure moves. It cannot
   * refuse, which is why it answers with a record where `correct` answers with
   * a result.
   */
  toggleKick: (id: string, at: Date) => Promise<DayLedgerRecord>
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

/**
 * A live-lane mark: one target, two routes, one act (`screens.md` § Marking a
 * Kick).
 *
 * A component of its own because the gesture is per mark and so is its timer —
 * and because *this* is where the routes are handed out. The Yesterday lane
 * draws the same session in the same halo and never comes through here, which
 * is what read-only-structurally means in code.
 */
function PuffMark({
  session,
  className,
  style,
  label,
  openEditor,
  toggleKick,
}: {
  session: PuffSession
  className: string
  style: CSSProperties
  label: string
  openEditor: () => void
  toggleKick: () => void
}) {
  const gesture = useMarkGesture({ tap: openEditor, hold: toggleKick })

  return (
    <button type="button" className={className} style={style} aria-label={label} {...gesture}>
      {session.count}
    </button>
  )
}

/**
 * The editor's `Kicked` toggle: the second route to the act, and the only one a
 * keyboard or a screen reader has (`screens.md` § Inside the editor).
 *
 * Everything around it is a Correction, where nothing commits until `Save
 * changes`. This is not, so it sits **above** the fields rather than among them,
 * applies on tap, and says so — two commit rules in one dialog is a real cost,
 * and the dialog carries it rather than hiding it. The second sentence teaches
 * the long-press: without it the two routes are two affordances rather than one
 * act with two doors, and the fast path is never found.
 *
 * **This copy is a first draft** and the one string in the Kick nobody has
 * reacted to. If the long-press is still undiscovered after a week of use, this
 * line is what to change first.
 */
function KickToggle({ session, toggle }: { session: PuffSession; toggle: () => void }) {
  return (
    <div className="kick-toggle">
      {/* A `switch` rather than a checkbox: it is on or off and applies as it
        * says, and the on-state is announced rather than only drawn in lilac.
        * The rule it does not share with the fields below is `describedby` so
        * it is heard with the control, not left as text beside it. */}
      <button
        type="button"
        role="switch"
        className="kick-switch"
        aria-checked={isKicked(session)}
        aria-describedby="kick-toggle-note"
        onClick={toggle}
      >
        Kicked
        <span className="kick-switch-track" aria-hidden="true" />
      </button>
      <p id="kick-toggle-note">Applies straight away. You can also long-press the mark.</p>
    </div>
  )
}

function RecordEditor({
  editor,
  record,
  today,
  timeZone,
  now,
  correct,
  toggleKick,
  close,
}: {
  editor: EditorState
  record: DayLedgerRecord
  today: LogicalDayKey
  timeZone: string
  now: Date
  correct: (correction: Correction) => void
  toggleKick: (id: string) => void
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
   * The session the toggle is drawn from, read off the **record** rather than
   * off the state this editor opened with.
   *
   * The Kick applies straight away, so the record moves under an editor that is
   * still open, and a toggle reading its own opening snapshot would go on
   * saying what was true when you tapped the mark. The snapshot is only a
   * fallback for the instant between the write and the record arriving back.
   */
  const puffSession =
    editor.kind === 'puff'
      ? record.puffSessions.find(({ id }) => id === editor.session.id) ?? editor.session
      : undefined

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
      {puffSession ? (
        <KickToggle session={puffSession} toggle={() => toggleKick(puffSession.id)} />
      ) : null}
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

  /** The room both lanes fan inside, kept current as the chrome above it comes and goes. */
  const [timeline, timelineSize] = useMeasuredBox<HTMLElement>()

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

  /**
   * The act itself, reached by a held press on a mark or by the editor's
   * toggle — the same call from both, because they are one act with two doors.
   *
   * Through the same queue as every other write, so a Kick and a `PUFF` landing
   * together stay in the order they were made. It leaves the Merge Window alone
   * on the way past: the window is keyed to taps, and this is not one.
   */
  function toggleKick(id: string) {
    const at = clock.now()
    mutate(() => source.toggleKick(id, at), at)
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
          {/* One horizontally scrollable row of day chips, both actions as
            * glyphs on the chip (`screens.md` § The catch-up strip). The strip
            * is transient and the timeline is the screen, so it is the strip
            * that pays for the timeline's floor — but only in drawn width: the
            * glyph is what shrinks, and each button still says the whole
            * sentence, naming its day, to anything that reads rather than
            * looks. */}
          <div className="catch-up-days">
            {view.catchUpDays.map((logicalDay) => {
              const day = formatLogicalDayWithWeekday(logicalDay)
              return (
                <article key={logicalDay} className="catch-up-day">
                  <time dateTime={logicalDay}>{day}</time>
                  <button
                    type="button"
                    aria-label={`Add what I remember for ${day}`}
                    onClick={() => setEditor({ kind: 'new', at: dateAtNoon(logicalDay) })}
                  >
                    <span aria-hidden="true">+</span>
                  </button>
                  <button
                    type="button"
                    className="catch-up-clear"
                    aria-label={`Mark ${day} a Clear Day`}
                    onClick={() => mutate(() => source.declareClearDay(dateAtNoon(logicalDay)))}
                  >
                    <span aria-hidden="true">✓</span>
                  </button>
                </article>
              )
            })}
          </div>
        </section>
      ) : null}

      <section
        className="timeline"
        aria-label="Logical Day timeline"
        ref={timeline}
        style={
          Object.fromEntries(
            LANE_AXES.map((axis) => [axis.variable, `${axis.spine}%`]),
          ) as CSSProperties
        }
      >
        {/* Drawn before everything else so the axis's own labels and the whole
          * of the live lane paint over it rather than under it. */}
        {view.yesterday ? (
          <YesterdayLane
            yesterday={view.yesterday}
            timeZone={timeZone}
            timelineSize={timelineSize}
          />
        ) : null}

        <span className="track-boundary-start">04:00</span>
        <div className="timeline-axis" aria-hidden="true" />
        <span className="track-boundary-end">04:00</span>

        {/* The hours below `now` have not happened yet, and the reader has to
          * know which content is real. Tone only: it sits behind everything and
          * moves nothing (`screens.md` § The two lanes). */}
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

        {/* The live lane owns everything right of its spine, and both lanes fan
          * right so the reading direction never changes. Its marks are the
          * handle for a Correction, which is the whole of what it disagrees
          * with the Yesterday lane about. */}
        <Lane
          axis={LIVE_LANE}
          puffSessions={view.puffSessions}
          resistedUrges={view.resistedUrges}
          timeZone={timeZone}
          timelineSize={timelineSize}
          renderMark={(event, mark) =>
            event.kind === 'puff' ? (
              <PuffMark
                session={event.session}
                className={`puff-mark${view.overTargetSessionIds.has(event.session.id) ? ' over-target' : ''}${view.openSession?.id === event.session.id ? ' open-mark' : ''}${kickedClass(event.session)}`}
                style={mark}
                label={puffLabel(event.session, timeZone)}
                openEditor={() => setEditor({ kind: 'puff', session: event.session })}
                toggleKick={() => toggleKick(event.session.id)}
              />
            ) : (
              <button
                type="button"
                className="resisted-mark"
                style={mark}
                aria-label={urgeLabel(event.urge, timeZone)}
                onClick={() => setEditor({ kind: 'urge', urge: event.urge })}
              />
            )
          }
        />
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
          toggleKick={toggleKick}
          close={() => setEditor(undefined)}
        />
      ) : null}
    </main>
  )
}
