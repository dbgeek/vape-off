import {
  dayTotal,
  isKnown,
  knownLogicalDayKeys,
  targetOn,
  type DayLedgerRecord,
} from '../domain/day-ledger.ts'
import {
  LOGICAL_DAY_START_HOUR,
  hourOf,
  logicalDayKeyOf,
  shiftLogicalDay,
} from '../domain/logical-day.ts'
import {
  DIAL_WINDOW_DAYS,
  isInDialWindow,
  kicksMarked,
  longestGap,
  momentum,
  quitHorizon,
  stepsRemaining,
  type LongestGap,
  type QuitHorizon,
  type StepsRemaining,
} from '../domain/readouts.ts'
import type { ExportRecord, LogicalDayKey } from '../store/records.ts'

const TREND_WINDOW_DAYS = 28

export interface DialHour {
  hour: number
  puffs: number
  urges: number
  outward: number
  inward: number
}

export interface TrendDay {
  logicalDay: LogicalDayKey
  total: number | null
  target: number | null
}

export type ProgrammeView =
  | { status: 'baseline'; knownDays: number; requiredDays: 7 }
  | {
      status: 'active'
      target: number
      momentum: number
      stepsRemaining: StepsRemaining
      quitHorizon: QuitHorizon
    }
  | { status: 'target-zero'; target: 0; momentum: number; stepBackAvailable: boolean }

export interface StatsView {
  dial: {
    windowDays: 14
    knownDays: number
    hours: DialHour[]
    peakHour: number | undefined
  }
  programme: ProgrammeView
  trend: TrendDay[]
  longestGap: LongestGap
  /**
   * The Kicks Marked reading, or `undefined` when the window holds none.
   *
   * Beside `programme` rather than inside it: one definition serves the
   * Baseline screen, ordinary Stats and `Target 0` alike, so the tile's silence
   * is the reading's own and not a rule any screen keeps. Nothing here
   * retires.
   */
  kicksMarked: number | undefined
  backup: { uncoveredKnownDays: number }
}

function dial(record: DayLedgerRecord, today: LogicalDayKey): StatsView['dial'] {
  const inWindow = (logicalDay: LogicalDayKey) => isInDialWindow(logicalDay, today)
  const knownDays = [...knownLogicalDayKeys(record)].filter(inWindow).length
  const hours = Array.from({ length: 24 }, (_, index) => ({
    hour: (index + LOGICAL_DAY_START_HOUR) % 24,
    puffs: 0,
    urges: 0,
    outward: 0,
    inward: 0,
  }))

  for (const session of record.puffSessions.filter((item) => inWindow(item.logicalDay))) {
    const index = (hourOf(session.at, session.tz) - LOGICAL_DAY_START_HOUR + 24) % 24
    hours[index]!.puffs += session.count
  }
  for (const urge of record.resistedUrges.filter((item) => inWindow(item.logicalDay))) {
    const index = (hourOf(urge.at, urge.tz) - LOGICAL_DAY_START_HOUR + 24) % 24
    hours[index]!.urges += 1
  }

  const largestPuffHour = Math.max(0, ...hours.map((hour) => hour.puffs))
  const largestUrgeHour = Math.max(0, ...hours.map((hour) => hour.urges))
  for (const hour of hours) {
    hour.outward = largestPuffHour === 0 ? 0 : hour.puffs / largestPuffHour
    hour.inward = largestUrgeHour === 0 ? 0 : hour.urges / largestUrgeHour
  }
  const peak = hours.reduce<DialHour | undefined>(
    (largest, hour) => (hour.puffs > (largest?.puffs ?? 0) ? hour : largest),
    undefined,
  )

  return {
    windowDays: DIAL_WINDOW_DAYS,
    knownDays,
    hours,
    peakHour: peak?.hour,
  }
}

function programme(record: DayLedgerRecord, today: LogicalDayKey): ProgrammeView {
  const target = targetOn(record, today)
  if (target === undefined) {
    const knownDays = [...knownLogicalDayKeys(record)].filter((logicalDay) => logicalDay < today).length
    return { status: 'baseline', knownDays: Math.min(knownDays, 7), requiredDays: 7 }
  }
  const score = momentum(record, today)
  if (target === 0) {
    return {
      status: 'target-zero',
      target,
      momentum: score,
      stepBackAvailable: !record.ratchetSteps.some((step) => step.effectiveFrom === today),
    }
  }
  return {
    status: 'active',
    target,
    momentum: score,
    stepsRemaining: stepsRemaining(record, today),
    quitHorizon: quitHorizon(record, today),
  }
}

function trend(record: DayLedgerRecord, today: LogicalDayKey): TrendDay[] {
  return Array.from({ length: TREND_WINDOW_DAYS }, (_, index) => {
    const logicalDay = shiftLogicalDay(today, index - (TREND_WINDOW_DAYS - 1))
    if (!isKnown(record, logicalDay)) return { logicalDay, total: null, target: null }
    return {
      logicalDay,
      total: dayTotal(record, logicalDay),
      target: targetOn(record, logicalDay) ?? null,
    }
  })
}

function uncoveredKnownDays(
  record: DayLedgerRecord,
  exports: readonly ExportRecord[],
): number {
  const latestBackup = exports.reduce<LogicalDayKey | undefined>(
    (latest, item) => (latest === undefined || item.logicalDay > latest ? item.logicalDay : latest),
    undefined,
  )
  return [...knownLogicalDayKeys(record)].filter(
    (logicalDay) => latestBackup === undefined || logicalDay > latestBackup,
  ).length
}

export function buildStatsView(
  record: DayLedgerRecord,
  exports: readonly ExportRecord[],
  now: Date,
  timeZone: string,
): StatsView {
  const today = logicalDayKeyOf(now, timeZone)
  return {
    dial: dial(record, today),
    programme: programme(record, today),
    trend: trend(record, today),
    longestGap: longestGap(record, now, today),
    kicksMarked: kicksMarked(record, today),
    backup: { uncoveredKnownDays: uncoveredKnownDays(record, exports) },
  }
}
