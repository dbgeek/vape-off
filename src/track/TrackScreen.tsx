import { useEffect, useMemo, useRef, useState } from 'react'
import {
  browserBackupSource,
  type BackupSource,
} from '../backup/browser-backup-source.ts'
import { useRestore } from '../backup/use-restore.ts'
import {
  completedDays,
  dayTotal,
  isKnown,
  targetOn,
  type DayLedgerRecord,
} from '../domain/day-ledger.ts'
import { isMergeWindowOpen } from '../domain/merge-window.ts'
import { momentum, pace } from '../domain/readouts.ts'
import { windowSatisfied } from '../domain/ratchet.ts'
import { isStandalone } from '../shell/install-state.ts'
import { logicalDayKeyOf, stampEvent } from '../store/logical-day.ts'
import type { LogicalDayKey, PuffSession, ResistedUrge } from '../store/records.ts'

const LOGICAL_DAY_START_MINUTE = 4 * 60

const emptyRecord: DayLedgerRecord = {
  puffSessions: [],
  resistedUrges: [],
  clearDays: [],
  ratchetSteps: [],
}

export interface TrackSource {
  load: () => Promise<DayLedgerRecord>
  loadFirstRunCardDismissed: () => Promise<boolean>
  logPuff: (at: Date) => Promise<DayLedgerRecord>
  logResistedUrge: (at: Date) => Promise<DayLedgerRecord>
  dismissFirstRunCard: () => Promise<void>
  declareClearDay: (at: Date) => Promise<DayLedgerRecord>
  addPuffSession: (input: { at: Date; count: number }) => Promise<DayLedgerRecord>
  addResistedUrge: (at: Date) => Promise<DayLedgerRecord>
  updatePuffSession: (
    id: string,
    input: { at: Date; count: number },
  ) => Promise<DayLedgerRecord>
  deletePuffSession: (id: string) => Promise<DayLedgerRecord>
  updateResistedUrge: (id: string, at: Date) => Promise<DayLedgerRecord>
  deleteResistedUrge: (id: string) => Promise<DayLedgerRecord>
  declareHandover: () => Promise<DayLedgerRecord>
}

export interface TrackClock {
  now: () => Date
  timeZone: () => string
}

const browserClock: TrackClock = {
  now: () => new Date(),
  timeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
}

function formatTime(at: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(typeof at === 'string' ? new Date(at) : at)
}

function logicalMinute(at: string | Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB-u-hc-h23', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(typeof at === 'string' ? new Date(at) : at)
  const numberPart = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0)
  const wallMinute =
    numberPart('hour') * 60 + numberPart('minute') + numberPart('second') / 60
  return (wallMinute - LOGICAL_DAY_START_MINUTE + 24 * 60) % (24 * 60)
}

function timelinePosition(at: string | Date, now: Date, timeZone: string): number {
  const eventMinute = logicalMinute(at, timeZone)
  const nowMinute = logicalMinute(now, timeZone)
  if (eventMinute <= nowMinute) {
    return nowMinute === 0 ? 0 : (eventMinute / nowMinute) * 50
  }
  const futureMinutes = 24 * 60 - nowMinute
  return 50 + ((eventMinute - nowMinute) / futureMinutes) * 50
}

function markSize(count: number): number {
  return Math.min(44, 12 + Math.sqrt(count) * 7)
}

function targetReachedSession(
  sessions: readonly PuffSession[],
  target: number | undefined,
): PuffSession | undefined {
  if (target === undefined || target === 0 || sessions.length === 0) return undefined
  let runningTotal = 0
  return sessions.find((session) => {
    runningTotal += session.count
    return runningTotal >= target
  })
}

function puffLabel(session: PuffSession, timeZone: string): string {
  const unit = session.count === 1 ? 'puff' : 'puffs'
  return `Puff Session, ${session.count} ${unit} at ${formatTime(session.at, timeZone)}`
}

function hasHistory(record: DayLedgerRecord): boolean {
  return (
    record.puffSessions.length > 0 ||
    record.resistedUrges.length > 0 ||
    record.clearDays.length > 0 ||
    record.ratchetSteps.length > 0
  )
}

function dateAtNoon(logicalDay: LogicalDayKey): Date {
  return new Date(`${logicalDay}T12:00:00`)
}

function formatLogicalDay(logicalDay: LogicalDayKey): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${logicalDay}T12:00:00.000Z`))
}

function wallParts(at: Date, timeZone: string): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-CA-u-hc-h23', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(at)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )
}

function dateTimeInputValue(at: string | Date, timeZone: string): string {
  const date = typeof at === 'string' ? new Date(at) : at
  const parts = wallParts(date, timeZone)
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

function instantFromDateTimeInput(value: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) throw new RangeError('Enter a date and time')
  const year = Number(match[1]!)
  const month = Number(match[2]!)
  const day = Number(match[3]!)
  const hour = Number(match[4]!)
  const minute = Number(match[5]!)
  const desiredWallTime = Date.UTC(year, month - 1, day, hour, minute)
  let candidate = new Date(desiredWallTime)

  for (let pass = 0; pass < 2; pass += 1) {
    const parts = wallParts(candidate, timeZone)
    const candidateWallTime = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
    )
    candidate = new Date(candidate.getTime() + desiredWallTime - candidateWallTime)
  }
  return candidate
}

type EditorState =
  | { kind: 'puff'; session: PuffSession }
  | { kind: 'urge'; urge: ResistedUrge }
  | { kind: 'new'; at: Date }

function RecordEditor({
  editor,
  source,
  record,
  today,
  timeZone,
  now,
  mutate,
  close,
}: {
  editor: EditorState
  source: TrackSource
  record: DayLedgerRecord
  today: LogicalDayKey
  timeZone: string
  now: Date
  mutate: (operation: () => Promise<DayLedgerRecord>) => void
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

  function confirmMomentumChange(draft: DayLedgerRecord, apply: () => void) {
    const before = momentum(record, today)
    const after = momentum(draft, today)
    if (before === after) {
      apply()
      return
    }
    setConfirmation({ before, after, apply })
  }

  function finish(operation: () => Promise<DayLedgerRecord>) {
    mutate(operation)
    close()
  }

  function save() {
    setValidationError(undefined)
    const parsedCount = Number(count)
    if (
      (editor.kind === 'puff' || (editor.kind === 'new' && eventKind === 'puff')) &&
      (!Number.isInteger(parsedCount) || parsedCount < 1)
    ) {
      setValidationError('Enter a whole puff count of at least 1.')
      return
    }
    let editedAt: Date
    try {
      editedAt = instantFromDateTimeInput(at, timeZone)
    } catch {
      setValidationError('Enter a date and time.')
      return
    }
    if (editedAt.getTime() > now.getTime()) {
      setValidationError('Choose a time that has already happened.')
      return
    }
    const stamp = stampEvent(editedAt, timeZone)
    if (editor.kind === 'puff') {
      const edited = { ...editor.session, ...stamp, count: parsedCount }
      const draft = {
        ...record,
        puffSessions: record.puffSessions.map((session) => session.id === edited.id ? edited : session),
        clearDays: record.clearDays.filter((day) => day.logicalDay !== edited.logicalDay),
      }
      confirmMomentumChange(draft, () => finish(() => source.updatePuffSession(editor.session.id, { at: editedAt, count: parsedCount })))
    } else if (editor.kind === 'urge') {
      const edited = { id: editor.urge.id, ...stamp }
      const draft = {
        ...record,
        resistedUrges: record.resistedUrges.map((urge) => urge.id === edited.id ? edited : urge),
      }
      confirmMomentumChange(draft, () => finish(() => source.updateResistedUrge(editor.urge.id, editedAt)))
    } else if (eventKind === 'puff') {
      const draft = {
        ...record,
        puffSessions: [...record.puffSessions, { id: 'preview', ...stamp, lastTapAt: stamp.at, count: parsedCount }],
        clearDays: record.clearDays.filter((day) => day.logicalDay !== stamp.logicalDay),
      }
      confirmMomentumChange(draft, () => finish(() => source.addPuffSession({ at: editedAt, count: parsedCount })))
    } else {
      const draft = {
        ...record,
        resistedUrges: [...record.resistedUrges, { id: 'preview', ...stamp }],
      }
      confirmMomentumChange(draft, () => finish(() => source.addResistedUrge(editedAt)))
    }
  }

  function remove() {
    if (editor.kind === 'puff') {
      const draft = { ...record, puffSessions: record.puffSessions.filter((session) => session.id !== editor.session.id) }
      confirmMomentumChange(draft, () => finish(() => source.deletePuffSession(editor.session.id)))
    }
    if (editor.kind === 'urge') {
      const draft = { ...record, resistedUrges: record.resistedUrges.filter((urge) => urge.id !== editor.urge.id) }
      confirmMomentumChange(draft, () => finish(() => source.deleteResistedUrge(editor.urge.id)))
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
  const today = logicalDayKeyOf(now, timeZone)

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
    const timer = window.setInterval(() => setNow(clock.now()), 1000)
    return () => {
      live = false
      window.clearInterval(timer)
    }
  }, [clock, source])

  const sessions = useMemo(
    () =>
      record.puffSessions
        .filter((session) => session.logicalDay === today)
        .sort((left, right) => Date.parse(left.at) - Date.parse(right.at)),
    [record.puffSessions, today],
  )
  const urges = record.resistedUrges.filter((urge) => urge.logicalDay === today)
  const total = dayTotal(record, today)
  const target = targetOn(record, today)
  const reached = targetReachedSession(sessions, target)
  const reachedIndex = reached ? sessions.indexOf(reached) : -1
  const openSession = [...sessions]
    .reverse()
    .find((session) => isMergeWindowOpen(session.lastTapAt, now))
  const paceReading = pace(record, now, timeZone)
  const ghostSlots =
    paceReading?.slots.filter((slot) => Date.parse(slot) > now.getTime()) ?? []
  const recordHasHistory = hasHistory(record)
  const earliestKnownDay = [
    ...record.puffSessions.map((session) => session.logicalDay),
    ...record.resistedUrges.map((urge) => urge.logicalDay),
    ...record.clearDays.map((day) => day.logicalDay),
  ].sort()[0]
  const earliestEvidenceDay =
    earliestKnownDay ?? [...record.ratchetSteps].sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom))[0]?.effectiveFrom
  const catchUpDays = recordHasHistory
    ? completedDays(7, today).filter(
        (logicalDay) =>
          earliestEvidenceDay !== undefined &&
          logicalDay >= earliestEvidenceDay &&
          !isKnown(record, logicalDay),
      )
    : []
  const todayIsClear = record.clearDays.some((day) => day.logicalDay === today)
  const latestStep = record.ratchetSteps.reduce<(typeof record.ratchetSteps)[number] | undefined>(
    (latest, step) => latest === undefined || step.effectiveFrom > latest.effectiveFrom ? step : latest,
    undefined,
  )
  const handoverAvailable =
    target === 1 && latestStep !== undefined && windowSatisfied(record, latestStep, today)

  function mutate(operation: () => Promise<DayLedgerRecord>, at = clock.now()) {
    setPendingWrites((count) => count + 1)
    writeQueue.current = writeQueue.current.then(async () => {
      try {
        setRecord(await operation())
        setFirstRunCardDismissed(true)
        setNow(at)
      } catch {
        setLoadFailed(true)
      } finally {
        setPendingWrites((count) => count - 1)
      }
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
          {target === undefined ? total : `${total} / ${target}`}
        </output>
      </header>

      {loadFailed ? <p className="track-load-error">Track could not read your record.</p> : null}

      {!installed && (forceInstallBar || recordHasHistory || restoreDoorOpen) ? (
        <aside className="install-bar" aria-label="Install vape-off">
          <strong>Install vape-off</strong>
          <span>Share → Add to Home Screen. Keep this tab open until the icon appears.</span>
        </aside>
      ) : null}

      {catchUpDays.length > 0 ? (
        <section className="catch-up-strip" aria-label="Catch up">
          <div className="catch-up-copy">
            <strong>Anything you remember?</strong>
            <span>It is fine to leave a day unknown.</span>
          </div>
          <div className="catch-up-days">
            {catchUpDays.map((logicalDay) => (
              <article key={logicalDay} className="catch-up-day">
                <time dateTime={logicalDay}>{formatLogicalDay(logicalDay)}</time>
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

        <div className="now-line" style={{ top: '50%' }}>
          <span>now</span>
          <time>{formatTime(now, timeZone)}</time>
        </div>

        {ghostSlots.map((slot) => (
          <span
            key={slot}
            className="pace-slot"
            style={{ top: `${timelinePosition(slot, now, timeZone)}%` }}
            aria-label={`Pace slot at ${formatTime(slot, timeZone)}`}
          />
        ))}

        {target === 0 || reached ? (
          <div
            className={`target-reached${target === 0 ? ' at-boundary' : ''}`}
            style={{ top: target === 0 ? '0%' : `${timelinePosition(reached!.at, now, timeZone)}%` }}
          >
            <span>Target reached {target === 0 ? '04:00' : formatTime(reached!.at, timeZone)}</span>
          </div>
        ) : null}

        {sessions.map((session, index) => {
          const size = markSize(session.count)
          return (
            <button
              type="button"
              key={session.id}
              className={`puff-mark${target === 0 || (reachedIndex >= 0 && index > reachedIndex) ? ' over-target' : ''}${openSession?.id === session.id ? ' open-mark' : ''}`}
              style={{
                top: `${timelinePosition(session.at, now, timeZone)}%`,
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

        {urges.map((urge) => (
          <button
            type="button"
            key={urge.id}
            className="resisted-mark"
            style={{ top: `${timelinePosition(urge.at, now, timeZone)}%` }}
            aria-label={`Resisted Urge at ${formatTime(urge.at, timeZone)}`}
            onClick={() => setEditor({ kind: 'urge', urge })}
          />
        ))}
      </section>

      <div className="track-offers">
        {!todayIsClear && sessions.length === 0 ? (
          <button type="button" onClick={() => mutate(() => source.declareClearDay(clock.now()))}>
            Declare today a Clear Day
          </button>
        ) : null}
        <button type="button" onClick={() => setEditor({ kind: 'new', at: clock.now() })}>
          Add past event
        </button>
      </div>

      {handoverAvailable ? (
        <aside className="handover-offer">
          <div><strong>You have held Target 1.</strong><span>The final step is yours.</span></div>
          <button type="button" onClick={() => mutate(source.declareHandover)}>Set Target to 0</button>
        </aside>
      ) : null}

      {openSession ? (
        <output className="open-session" aria-live="polite">
          <span className="open-session-pulse" aria-hidden="true" />
          Open session · {openSession.count} {openSession.count === 1 ? 'puff' : 'puffs'}
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
          {openSession ? `+1 → ${openSession.count + 1}` : 'PUFF'}
        </button>
      </div>

      {loaded && !recordHasHistory && !firstRunCardDismissed ? (
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
          source={source}
          record={record}
          today={today}
          timeZone={timeZone}
          now={now}
          mutate={mutate}
          close={() => setEditor(undefined)}
        />
      ) : null}
    </main>
  )
}
