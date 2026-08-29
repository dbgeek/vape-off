import {
  dayTotal,
  isKnown,
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
import { logicalDayKeyOf } from '../store/logical-day.ts'
import type { ExportRecord, LogicalDayKey } from '../store/records.ts'

const DIAL_WINDOW_DAYS = 14
const TREND_WINDOW_DAYS = 28
const LOGICAL_DAY_START_HOUR = 4

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
  | { status: 'target-zero'; target: 0; momentum: number }

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

function shiftLogicalDay(logicalDay: LogicalDayKey, days: number): LogicalDayKey {
  const date = new Date(`${logicalDay}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function knownLogicalDays(record: DayLedgerRecord): Set<LogicalDayKey> {
  return new Set([
    ...record.puffSessions.map((session) => session.logicalDay),
    ...record.resistedUrges.map((urge) => urge.logicalDay),
    ...record.clearDays.map((day) => day.logicalDay),
  ])
}

function hourOf(at: string, timeZone: string): number {
  const hour = new Intl.DateTimeFormat('en-GB-u-hc-h23', {
    timeZone,
    hour: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(new Date(at))
    .find((part) => part.type === 'hour')?.value
  if (hour === undefined) throw new RangeError('Missing hour from formatted instant')
  return Number(hour)
}

function dial(record: DayLedgerRecord, today: LogicalDayKey): StatsView['dial'] {
  const firstDay = shiftLogicalDay(today, -(DIAL_WINDOW_DAYS - 1))
  const inWindow = (logicalDay: LogicalDayKey) => logicalDay >= firstDay && logicalDay <= today
  const knownDays = [...knownLogicalDays(record)].filter(inWindow).length
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
    const knownDays = [...knownLogicalDays(record)].filter((logicalDay) => logicalDay < today).length
    return { status: 'baseline', knownDays: Math.min(knownDays, 7), requiredDays: 7 }
  }
  const score = momentum(record, today)
  if (target === 0) return { status: 'target-zero', target, momentum: score }
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

function hasDisqualifiedGap(record: DayLedgerRecord, today: LogicalDayKey): boolean {
  const sessions = [...record.puffSessions].sort((left, right) => left.at.localeCompare(right.at))
  if (sessions.length === 0) return false
  const knownDays = knownLogicalDays(record)
  const intervals = sessions.slice(1).map((session, index) => [sessions[index]!.logicalDay, session.logicalDay] as const)
  intervals.push([sessions.at(-1)!.logicalDay, today])
  return intervals.some(([start, end]) => {
    for (let day = start; day <= end; day = shiftLogicalDay(day, 1)) {
      if (!knownDays.has(day)) return true
    }
    return false
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
  return [...knownLogicalDays(record)].filter(
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
    longestGap: {
      milliseconds: longestGap(record, now, today),
      disqualifiedByUnknownDay: hasDisqualifiedGap(record, today),
    },
    backup: { uncoveredKnownDays: uncoveredKnownDays(record, exports) },
  }
}
