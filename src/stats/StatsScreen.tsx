import { useEffect, useMemo, useState } from 'react'
import type { DayLedgerRecord } from '../domain/day-ledger.ts'
import type { QuitHorizon } from '../domain/readouts.ts'
import { isStandalone } from '../shell/install-state.ts'
import type { ExportRecord } from '../store/records.ts'
import { buildStatsView, type DialHour, type TrendDay } from './stats-view.ts'

export interface StatsSnapshot {
  record: DayLedgerRecord
  exports: readonly ExportRecord[]
  backupCardDismissedAt: number
}

export interface StatsSource {
  load: () => Promise<StatsSnapshot>
  dismissBackupCard: (uncoveredKnownDays: number) => Promise<void>
  declareStepBack: () => Promise<StatsSnapshot>
}

export interface StatsClock {
  now: () => Date
  timeZone: () => string
}

const browserClock: StatsClock = {
  now: () => new Date(),
  timeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
}

function polarPoint(radius: number, index: number): { x: number; y: number } {
  const angle = (index / 24) * Math.PI * 2 - Math.PI / 2
  return { x: 100 + Math.cos(angle) * radius, y: 100 + Math.sin(angle) * radius }
}

function Dial({ hours, peakHour }: { hours: DialHour[]; peakHour: number | undefined }) {
  return (
    <section className="stats-dial-section" aria-label="Recent hours">
      <svg className="stats-dial" viewBox="0 0 200 200" role="img" aria-label="24-hour Dial, 04:00 at the top">
        <circle className="dial-ring" cx="100" cy="100" r="58" />
        {hours.map((hour, index) => {
          const ring = polarPoint(58, index)
          const outward = polarPoint(58 + hour.outward * 34, index)
          const inward = polarPoint(58 - hour.inward * 28, index)
          return (
            <g key={hour.hour} aria-label={`${String(hour.hour).padStart(2, '0')}:00, ${hour.puffs} puffs, ${hour.urges} resisted urges`}>
              <line className="dial-grid" x1="100" y1="100" x2={ring.x} y2={ring.y} />
              <line className="dial-puffs" x1={ring.x} y1={ring.y} x2={outward.x} y2={outward.y} />
              <line className="dial-urges" x1={ring.x} y1={ring.y} x2={inward.x} y2={inward.y} />
            </g>
          )
        })}
        <text className="dial-boundary" x="100" y="13" textAnchor="middle">04:00</text>
        <text className="dial-centre-kicker" x="100" y="96" textAnchor="middle">largest hour</text>
        <text className="dial-centre-hour" x="100" y="114" textAnchor="middle">
          {peakHour === undefined ? '—' : `${String(peakHour).padStart(2, '0')}:00`}
        </text>
      </svg>
      <p className="stats-reading">
        {peakHour === undefined
          ? 'No largest hour yet.'
          : `Your largest hour is ${String(peakHour).padStart(2, '0')}:00.`}
      </p>
      <p className="stats-window">Latest 14 Logical Days · Unknown days omitted</p>
    </section>
  )
}

function lineSegments(days: TrendDay[], key: 'total' | 'target', maximum: number): string[] {
  const segments: string[] = []
  let points: string[] = []
  days.forEach((day, index) => {
    const value = day[key]
    if (value === null) {
      if (points.length > 0) segments.push(points.join(' '))
      points = []
      return
    }
    const x = 4 + (index / (days.length - 1)) * 272
    const y = 76 - (value / maximum) * 64
    points.push(`${x},${y}`)
  })
  if (points.length > 0) segments.push(points.join(' '))
  return segments
}

function Trend({ days }: { days: TrendDay[] }) {
  const maximum = Math.max(
    1,
    ...days.flatMap((day) => [day.total, day.target].filter((value): value is number => value !== null)),
  )
  return (
    <section className="stats-section">
      <div className="stats-section-heading">
        <h2>28 Logical Days</h2>
        <span>Puffs / Target</span>
      </div>
      <svg className="stats-trend" viewBox="0 0 280 84" role="img" aria-label="28-day puff and Target trend">
        {lineSegments(days, 'total', maximum).map((points, index) => (
          <polyline key={`total-${index}`} className="trend-total-segment" points={points} />
        ))}
        {lineSegments(days, 'target', maximum).map((points, index) => (
          <polyline key={`target-${index}`} className="trend-target-segment" points={points} />
        ))}
      </svg>
    </section>
  )
}

function formatDuration(milliseconds: number | undefined): string {
  if (milliseconds === undefined) return '—'
  const hours = milliseconds / (60 * 60 * 1000)
  if (hours < 48) return `${Math.floor(hours)} hours`
  const days = Math.floor(hours / 24)
  const remainingHours = Math.floor(hours % 24)
  return remainingHours === 0 ? `${days} days` : `${days} days ${remainingHours} hours`
}

function formatHorizon(horizon: QuitHorizon): string {
  if (horizon.status !== 'available') return '—'
  if (horizon.precision === 'date') {
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
      new Date(`${horizon.value}T12:00:00.000Z`),
    )
  }
  return `about ${horizon.value} ${horizon.precision}`
}

export function StatsScreen({
  source,
  clock = browserClock,
  installed = isStandalone(),
}: {
  source: StatsSource
  clock?: StatsClock
  installed?: boolean
}) {
  const [snapshot, setSnapshot] = useState<StatsSnapshot>()
  const [error, setError] = useState<string>()
  const [backupCardDismissed, setBackupCardDismissed] = useState(false)
  const [programmeDetailsOpen, setProgrammeDetailsOpen] = useState(false)
  const [stepBackOpen, setStepBackOpen] = useState(false)

  useEffect(() => {
    let alive = true
    source.load().then(
      (loaded) => {
        if (alive) setSnapshot(loaded)
      },
      () => {
        if (alive) setError('Stats are unavailable.')
      },
    )
    return () => {
      alive = false
    }
  }, [source])

  const now = clock.now()
  const timeZone = clock.timeZone()
  const view = useMemo(
    () => (snapshot ? buildStatsView(snapshot.record, snapshot.exports, now, timeZone) : undefined),
    [snapshot, now, timeZone],
  )

  if (!view || !snapshot) {
    return <main className="stats-screen">{error ? <p>{error}</p> : <p>Reading Stats…</p>}</main>
  }

  if (view.programme.status === 'baseline') {
    return (
      <main className="stats-screen">
        <header className="stats-header">
          <p className="stats-kicker">The first measure</p>
          <h1>Baseline</h1>
          <p>{view.programme.knownDays} of 7 Known Logical Days</p>
        </header>
        <Dial hours={view.dial.hours} peakHour={view.dial.peakHour} />
      </main>
    )
  }

  const backupDays = view.backup.uncoveredKnownDays
  const showBackupCard =
    installed &&
    backupDays >= snapshot.backupCardDismissedAt + 30 &&
    !backupCardDismissed
  const targetZero = view.programme.status === 'target-zero'

  function dismissBackupCard() {
    setBackupCardDismissed(true)
    void source.dismissBackupCard(backupDays).catch(() => setBackupCardDismissed(false))
  }

  function confirmStepBack() {
    void source.declareStepBack().then((loaded) => {
      setSnapshot(loaded)
      setStepBackOpen(false)
      setProgrammeDetailsOpen(false)
    })
  }

  return (
    <main className="stats-screen">
      <header className="stats-header">
        <p className="stats-kicker">Target {view.programme.target}</p>
        <h1>Stats</h1>
      </header>

      <Dial hours={view.dial.hours} peakHour={view.dial.peakHour} />

      {view.programme.status === 'target-zero' ? (
        <>
          <section className="stats-headline" aria-label="Longest Gap">
            <span>Longest Gap</span>
            <strong>{formatDuration(view.longestGap.milliseconds)}</strong>
            {view.longestGap.disqualifiedByUnknownDay ? <small>Unknown Logical Days excluded longer gaps.</small> : null}
          </section>
          <section className="stats-momentum">
            <span>Momentum</span>
            <strong>{view.programme.momentum}</strong>
          </section>
        </>
      ) : (
        <div className="stats-tiles">
          <section className="stats-tile" aria-label="Steps Remaining">
            <span>Steps Remaining</span>
            <strong>{view.programme.stepsRemaining.status === 'available' ? view.programme.stepsRemaining.value : '—'}</strong>
          </section>
          <section className="stats-tile" aria-label="Quit Horizon">
            <span>Quit Horizon</span>
            <strong>{formatHorizon(view.programme.quitHorizon)}</strong>
          </section>
        </div>
      )}

      <Trend days={view.trend} />

      {!targetZero ? (
        <section className="stats-section" aria-label="Longest Gap">
          <div className="stats-section-heading"><h2>Longest Gap</h2></div>
          <strong className="stats-longest-value">{formatDuration(view.longestGap.milliseconds)}</strong>
          {view.longestGap.disqualifiedByUnknownDay ? <p className="stats-footnote">Unknown Logical Days excluded longer gaps.</p> : null}
        </section>
      ) : null}

      {installed ? <p className="backup-line">{backupDays === 0 ? 'Last backup: up to date.' : `Last backup: ${backupDays} Logical ${backupDays === 1 ? 'Day' : 'Days'} ago.`}</p> : null}
      {showBackupCard ? (
        <section className="backup-card" role="region" aria-label="Backup status">
          <button type="button" aria-label="Dismiss backup card" onClick={dismissBackupCard}>×</button>
          <strong>{backupDays} Known Logical Days</strong>
          <p>That is the record since the last backup.</p>
        </section>
      ) : null}

      {targetZero ? (
        <section className="programme-details">
          <button type="button" onClick={() => setProgrammeDetailsOpen((open) => !open)}>Programme details</button>
          {programmeDetailsOpen ? (
            <button type="button" onClick={() => setStepBackOpen(true)}>Step back to Target 1</button>
          ) : null}
        </section>
      ) : null}

      {stepBackOpen ? (
        <section className="step-back-dialog" role="dialog" aria-modal="true" aria-label="Step back to Target 1">
          <h2>Step back to Target 1</h2>
          <p>Target 1 returns from this Logical Day.</p>
          <div>
            <button type="button" onClick={() => setStepBackOpen(false)}>Keep Target 0</button>
            <button type="button" onClick={confirmStepBack}>Set Target to 1</button>
          </div>
        </section>
      ) : null}
    </main>
  )
}
