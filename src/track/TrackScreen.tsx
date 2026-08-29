import { useEffect, useMemo, useRef, useState } from 'react'
import { dayTotal, targetOn, type DayLedgerRecord } from '../domain/day-ledger.ts'
import { isMergeWindowOpen } from '../domain/merge-window.ts'
import { pace } from '../domain/readouts.ts'
import { logicalDayKeyOf } from '../store/logical-day.ts'
import type { PuffSession } from '../store/records.ts'

const LOGICAL_DAY_START_MINUTE = 4 * 60

const emptyRecord: DayLedgerRecord = {
  puffSessions: [],
  resistedUrges: [],
  clearDays: [],
  ratchetSteps: [],
}

export interface TrackSource {
  load: () => Promise<DayLedgerRecord>
  logPuff: (at: Date) => Promise<DayLedgerRecord>
  logResistedUrge: (at: Date) => Promise<DayLedgerRecord>
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

export function TrackScreen({
  source,
  clock = browserClock,
}: {
  source: TrackSource
  clock?: TrackClock
}) {
  const [record, setRecord] = useState<DayLedgerRecord>(emptyRecord)
  const [now, setNow] = useState(clock.now)
  const [pendingWrites, setPendingWrites] = useState(0)
  const [loadFailed, setLoadFailed] = useState(false)
  const writeQueue = useRef<Promise<void>>(Promise.resolve())
  const timeZone = clock.timeZone()
  const today = logicalDayKeyOf(now, timeZone)

  useEffect(() => {
    let live = true
    source.load().then(
      (loaded) => {
        if (live) setRecord(loaded)
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

  function write(operation: (at: Date) => Promise<DayLedgerRecord>) {
    const at = clock.now()
    setPendingWrites((count) => count + 1)
    writeQueue.current = writeQueue.current.then(async () => {
      try {
        setRecord(await operation(at))
        setNow(at)
      } catch {
        setLoadFailed(true)
      } finally {
        setPendingWrites((count) => count - 1)
      }
    })
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
            <span
              key={session.id}
              className={`puff-mark${target === 0 || (reachedIndex >= 0 && index > reachedIndex) ? ' over-target' : ''}${openSession?.id === session.id ? ' open-mark' : ''}`}
              style={{
                top: `${timelinePosition(session.at, now, timeZone)}%`,
                width: `${size}px`,
                height: `${size}px`,
              }}
              aria-label={puffLabel(session, timeZone)}
            >
              {session.count}
            </span>
          )
        })}

        {urges.map((urge) => (
          <span
            key={urge.id}
            className="resisted-mark"
            style={{ top: `${timelinePosition(urge.at, now, timeZone)}%` }}
            aria-label={`Resisted Urge at ${formatTime(urge.at, timeZone)}`}
          />
        ))}
      </section>

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
    </main>
  )
}
