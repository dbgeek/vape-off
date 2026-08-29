import {
  dayTotal,
  isKnown,
  knownLogicalDayKeys,
  targetOn,
  type DayLedgerRecord,
} from '../domain/day-ledger.ts'
import {
  longestGap,
  momentum,
  quitHorizon,
  stepsRemaining,
  type QuitHorizon,
  type StepsRemaining,
} from '../domain/readouts.ts'
import {
  hourOf,
  intervalIsKnown,
  logicalDayKeyOf,
  shiftLogicalDay,
  LOGICAL_DAY_START_HOUR,
} from '../domain/logical-day.ts'
import type { ExportRecord, LogicalDayKey } from '../store/records.ts'

const DIAL_WINDOW_DAYS = 14
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
  longestGap: {
    milliseconds: number | undefined
    disqualifiedByUnknownDay: boolean
  }
  backup: { uncoveredKnownDays: number }
}

function dial(record: DayLedgerRecord, today: LogicalDayKey): StatsView['dial'] {
  const firstDay = shiftLogicalDay(today, -(DIAL_WINDOW_DAYS - 1))
  const inWindow = (logicalDay: LogicalDayKey) => logicalDay >= firstDay && logicalDay <= today
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

function hasDisqualifiedGap(
  record: DayLedgerRecord,
  now: Date,
  today: LogicalDayKey,
  honestGap: number | undefined,
): boolean {
  const sessions = [...record.puffSessions].sort(
    (left, right) => Date.parse(left.at) - Date.parse(right.at),
  )
  if (sessions.length === 0) return false
  const knownDays = knownLogicalDayKeys(record)
  const excludedDurations = sessions.slice(1).flatMap((session, index) => {
    const previous = sessions[index]!
    return intervalIsKnown(knownDays, previous.logicalDay, session.logicalDay)
      ? []
      : [Date.parse(session.at) - Date.parse(previous.at)]
  })
  const latest = sessions.at(-1)!
  if (!intervalIsKnown(knownDays, latest.logicalDay, today)) {
    excludedDurations.push(now.getTime() - Date.parse(latest.at))
  }
  return excludedDurations.some((duration) => duration > (honestGap ?? -Infinity))
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
  const gap = longestGap(record, now, today)
  return {
    dial: dial(record, today),
    programme: programme(record, today),
    trend: trend(record, today),
    longestGap: {
      milliseconds: gap,
      disqualifiedByUnknownDay: hasDisqualifiedGap(record, now, today, gap),
    },
    backup: { uncoveredKnownDays: uncoveredKnownDays(record, exports) },
  }
}
