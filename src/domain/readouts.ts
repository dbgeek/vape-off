import type { LogicalDayKey } from '../store/records.ts'
import { logicalDayKeyOf } from '../store/logical-day.ts'
import {
  dayTotal,
  isMet,
  knownLogicalDayKeys,
  targetOn,
  type DayLedgerRecord,
} from './day-ledger.ts'
import { nextEarnedTarget } from './ratchet.ts'

const PACE_WINDOW_OPEN_HOUR = 7
const PACE_WINDOW_CLOSE_HOUR = 23
const MIN_PACE_INTERVAL_MS = 10 * 60 * 1000

export interface PaceReading {
  intervalMs: number
  nextDue: string
  slots: string[]
}

export type StepsRemaining =
  | { status: 'absent' | 'retired' }
  | { status: 'available'; value: number }

export type QuitHorizon =
  | { status: 'absent' | 'retired' | 'withdrawn' }
  | { status: 'available'; precision: 'months' | 'weeks'; value: number }
  | { status: 'available'; precision: 'date'; value: LogicalDayKey }

interface LocalDateTime {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

function localDateTime(at: Date, timeZone: string): LocalDateTime {
  const parts = new Intl.DateTimeFormat('en-CA-u-hc-h23', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at)
  const numberPart = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((part) => part.type === type)?.value
    if (value === undefined) throw new RangeError(`Missing ${type} from formatted instant`)
    return Number(value)
  }
  return {
    year: numberPart('year'),
    month: numberPart('month'),
    day: numberPart('day'),
    hour: numberPart('hour'),
    minute: numberPart('minute'),
  }
}

function offsetMilliseconds(at: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat('en', {
    timeZone,
    timeZoneName: 'longOffset',
  })
    .formatToParts(at)
    .find((part) => part.type === 'timeZoneName')?.value
  if (name === undefined) throw new RangeError('Missing time-zone offset from formatted instant')
  if (name === 'GMT') return 0
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(name)
  if (!match) throw new RangeError(`Unsupported time-zone offset: ${name}`)
  const sign = match[1] === '+' ? 1 : -1
  return sign * (Number(match[2]) * 60 + Number(match[3])) * 60 * 1000
}

function instantAtLocalHour(local: LocalDateTime, hour: number, timeZone: string): Date {
  const wallClock = Date.UTC(local.year, local.month - 1, local.day, hour)
  let result = new Date(wallClock - offsetMilliseconds(new Date(wallClock), timeZone))
  result = new Date(wallClock - offsetMilliseconds(result, timeZone))
  return result
}

function daysBetween(start: LogicalDayKey, end: LogicalDayKey): number {
  return (
    (Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) /
    (24 * 60 * 60 * 1000)
  )
}

function shiftLogicalDay(logicalDay: LogicalDayKey, days: number): LogicalDayKey {
  const date = new Date(`${logicalDay}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function round(value: number): number {
  return Math.floor(value + 0.5)
}

function earnedSteps(record: DayLedgerRecord) {
  return record.ratchetSteps
    .filter((step) => step.kind === 'earned')
    .sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom))
}

function intervalIsKnown(
  knownDays: ReadonlySet<LogicalDayKey>,
  start: LogicalDayKey,
  end: LogicalDayKey,
): boolean {
  if (start > end) return false
  for (let day = start; day <= end; day = shiftLogicalDay(day, 1)) {
    if (!knownDays.has(day)) return false
  }
  return true
}

export function momentum(record: DayLedgerRecord, today: LogicalDayKey): number {
  const knownDays = knownLogicalDayKeys(record)

  let score = 0
  for (const logicalDay of [...knownDays].filter((day) => day < today).sort()) {
    if (targetOn(record, logicalDay) === undefined) continue
    score = isMet(record, logicalDay, today) ? score + 1 : Math.max(0, score - 1)
  }
  return score
}

export function pace(
  record: DayLedgerRecord,
  now: Date,
  timeZone: string,
): PaceReading | undefined {
  const local = localDateTime(now, timeZone)
  const minutesSinceMidnight = local.hour * 60 + local.minute
  if (
    minutesSinceMidnight < PACE_WINDOW_OPEN_HOUR * 60 ||
    minutesSinceMidnight >= PACE_WINDOW_CLOSE_HOUR * 60
  ) {
    return undefined
  }

  const today = logicalDayKeyOf(now, timeZone)
  const target = targetOn(record, today)
  if (target === undefined) return undefined
  const remaining = target - dayTotal(record, today)
  if (remaining <= 0) return undefined

  const open = instantAtLocalHour(local, PACE_WINDOW_OPEN_HOUR, timeZone)
  const close = instantAtLocalHour(local, PACE_WINDOW_CLOSE_HOUR, timeZone)
  const intervalMs = (close.getTime() - now.getTime()) / remaining
  if (intervalMs < MIN_PACE_INTERVAL_MS) return undefined

  const latestSessionAt = record.puffSessions
    .filter((session) => session.logicalDay === today)
    .reduce((latest, session) => Math.max(latest, new Date(session.at).getTime()), -Infinity)
  const anchor = Math.max(open.getTime(), latestSessionAt)
  const slots = Array.from({ length: remaining }, (_, index) =>
    new Date(anchor + (index + 1) * intervalMs).toISOString(),
  )

  return { intervalMs, nextDue: slots[0]!, slots }
}

export function stepsRemaining(
  record: DayLedgerRecord,
  today: LogicalDayKey,
): StepsRemaining {
  let target = targetOn(record, today)
  if (target === undefined) return { status: 'absent' }
  if (target === 0) return { status: 'retired' }

  let steps = 1 // the Declared handover from Target 1 to Target 0
  while (target > 1) {
    target = nextEarnedTarget(target)
    steps += 1
  }
  return { status: 'available', value: steps }
}

export function stepCadence(record: DayLedgerRecord): number | undefined {
  const earned = earnedSteps(record)
  if (earned.length < 2) return undefined
  return daysBetween(earned[0]!.effectiveFrom, earned.at(-1)!.effectiveFrom) / (earned.length - 1)
}

export function quitHorizon(
  record: DayLedgerRecord,
  today: LogicalDayKey,
): QuitHorizon {
  const target = targetOn(record, today)
  if (target === undefined) return { status: 'absent' }
  if (target === 0) return { status: 'retired' }

  const cadence = stepCadence(record)
  if (cadence === undefined) return { status: 'absent' }
  const latestEarnedStep = earnedSteps(record).at(-1)!
  if (daysBetween(latestEarnedStep.effectiveFrom, today) > 2 * cadence) {
    return { status: 'withdrawn' }
  }

  const remaining = stepsRemaining(record, today)
  if (remaining.status !== 'available') return remaining
  const days = remaining.value * cadence
  if (days > 84) return { status: 'available', precision: 'months', value: round(days / 30.44) }
  if (days >= 14) return { status: 'available', precision: 'weeks', value: round(days / 7) }
  return {
    status: 'available',
    precision: 'date',
    value: shiftLogicalDay(today, round(days)),
  }
}

export function longestGap(
  record: DayLedgerRecord,
  now: Date,
  today: LogicalDayKey,
): number | undefined {
  const sessions = [...record.puffSessions].sort(
    (left, right) => Date.parse(left.at) - Date.parse(right.at),
  )
  if (sessions.length === 0) return undefined

  const knownDays = knownLogicalDayKeys(record)
  let best: number | undefined
  for (let index = 1; index < sessions.length; index += 1) {
    const previous = sessions[index - 1]!
    const current = sessions[index]!
    if (intervalIsKnown(knownDays, previous.logicalDay, current.logicalDay)) {
      best = Math.max(best ?? 0, Date.parse(current.at) - Date.parse(previous.at))
    }
  }

  const latest = sessions.at(-1)!
  if (intervalIsKnown(knownDays, latest.logicalDay, today)) {
    const runningGap = now.getTime() - Date.parse(latest.at)
    if (runningGap >= 0) best = Math.max(best ?? 0, runningGap)
  }
  return best
}
