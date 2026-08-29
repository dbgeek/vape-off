import type { EventStamp, Instant, LogicalDayKey } from '../store/records.ts'

export type { EventStamp, Instant, LogicalDayKey } from '../store/records.ts'

export const LOGICAL_DAY_START_HOUR = 4

const MILLISECONDS_PER_MINUTE = 60 * 1000
const MILLISECONDS_PER_HOUR = 60 * MILLISECONDS_PER_MINUTE
const MILLISECONDS_PER_DAY = 24 * MILLISECONDS_PER_HOUR
const MINUTES_PER_DAY = 24 * 60

/** What the clock on the wall reads in some time zone, at some instant. */
export interface WallClock {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  millisecond: number
  /** How far the wall clock runs ahead of UTC at that instant. */
  offsetMs: number
}

/** A wall-clock reading to solve back into an instant. Missing fields read as zero. */
export interface WallClockInput {
  year: number
  month: number
  day: number
  hour?: number
  minute?: number
  second?: number
  millisecond?: number
}

const wallClockReaders = new Map<string, Intl.DateTimeFormat>()

function wallClockReader(timeZone: string): Intl.DateTimeFormat {
  let reader = wallClockReaders.get(timeZone)
  if (reader === undefined) {
    reader = new Intl.DateTimeFormat('en-CA-u-hc-h23', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
      hourCycle: 'h23',
    })
    wallClockReaders.set(timeZone, reader)
  }
  return reader
}

function numberPart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): number {
  const value = parts.find((part) => part.type === type)?.value
  if (value === undefined) throw new RangeError(`Missing ${type} from formatted instant`)
  return Number(value)
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0')
}

function asDate(at: Date | Instant): Date {
  return typeof at === 'string' ? new Date(at) : at
}

function utcMillisecondsOf(wall: WallClockInput): number {
  return Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour ?? 0,
    wall.minute ?? 0,
    wall.second ?? 0,
    wall.millisecond ?? 0,
  )
}

/** The time zone this device is keeping. */
export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

const timeZoneValidity = new Map<string, boolean>()

/** Whether `value` is an IANA time-zone identifier the runtime recognises. */
export function isTimeZone(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const cached = timeZoneValidity.get(value)
  if (cached !== undefined) return cached
  let valid = true
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format(0)
  } catch {
    valid = false
  }
  timeZoneValidity.set(value, valid)
  return valid
}

/** What the wall clock in `timeZone` reads at `at`. */
export function wallClockAt(at: Date | Instant, timeZone: string): WallClock {
  const instant = asDate(at)
  const parts = wallClockReader(timeZone).formatToParts(instant)
  const wall = {
    year: numberPart(parts, 'year'),
    month: numberPart(parts, 'month'),
    day: numberPart(parts, 'day'),
    hour: numberPart(parts, 'hour'),
    minute: numberPart(parts, 'minute'),
    second: numberPart(parts, 'second'),
    millisecond: numberPart(parts, 'fractionalSecond'),
  }
  return { ...wall, offsetMs: utcMillisecondsOf(wall) - instant.getTime() }
}

/**
 * The instant at which the wall clock in `timeZone` reads `wall`.
 *
 * Two passes: the first guesses using the offset in force at that reading taken
 * as UTC, the second corrects it using the offset in force at the guess. That
 * settles every zone whose offset changes at most once across the gap between
 * them — which is every real daylight-saving transition.
 */
export function instantAtWallClock(wall: WallClockInput, timeZone: string): Date {
  const target = utcMillisecondsOf(wall)
  let candidate = new Date(target)
  for (let pass = 0; pass < 2; pass += 1) {
    candidate = new Date(target - wallClockAt(candidate, timeZone).offsetMs)
  }
  return candidate
}

/** The Logical Day `at` falls in — the 04:00-to-04:00 period around the local wall clock. */
export function logicalDayKeyOf(at: Date | Instant, timeZone: string): LogicalDayKey {
  const wall = wallClockAt(at, timeZone)
  const date = new Date(
    Date.UTC(wall.year, wall.month - 1, wall.day - (wall.hour < LOGICAL_DAY_START_HOUR ? 1 : 0)),
  )
  return date.toISOString().slice(0, 10)
}

function formatOffset(offsetMs: number): string {
  const sign = offsetMs < 0 ? '-' : '+'
  const magnitude = Math.abs(offsetMs)
  return `${sign}${pad(Math.floor(magnitude / MILLISECONDS_PER_HOUR))}:${pad(
    Math.floor((magnitude % MILLISECONDS_PER_HOUR) / MILLISECONDS_PER_MINUTE),
  )}`
}

/** `at` written as the local wall clock plus its offset, so the reading survives travel. */
export function instantOf(at: Date | Instant, timeZone: string): Instant {
  const wall = wallClockAt(at, timeZone)
  return `${pad(wall.year, 4)}-${pad(wall.month)}-${pad(wall.day)}T${pad(wall.hour)}:${pad(
    wall.minute,
  )}:${pad(wall.second)}.${pad(wall.millisecond, 3)}${formatOffset(wall.offsetMs)}`
}

export function stampEvent(at: Date, timeZone = deviceTimeZone()): EventStamp {
  return {
    at: instantOf(at, timeZone),
    logicalDay: logicalDayKeyOf(at, timeZone),
    tz: timeZone,
  }
}

/** The wall-clock hour, 0–23, that `at` falls in. */
export function hourOf(at: Date | Instant, timeZone: string): number {
  return wallClockAt(at, timeZone).hour
}

/** Minutes elapsed since the Logical Day opened at 04:00, 0 up to 1440. */
export function logicalMinuteOf(at: Date | Instant, timeZone: string): number {
  const wall = wallClockAt(at, timeZone)
  const wallMinute = wall.hour * 60 + wall.minute + wall.second / 60
  return (wallMinute - LOGICAL_DAY_START_HOUR * 60 + MINUTES_PER_DAY) % MINUTES_PER_DAY
}

export function shiftLogicalDay(logicalDay: LogicalDayKey, days: number): LogicalDayKey {
  const date = new Date(`${logicalDay}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function daysBetween(start: LogicalDayKey, end: LogicalDayKey): number {
  return (
    (Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) /
    MILLISECONDS_PER_DAY
  )
}

/**
 * Whether every Logical Day from `start` to `end` inclusive is Known.
 *
 * An interval that ends before it starts vouches for nothing, so it is not
 * Known. That case is reachable: a Logical Day is stamped in the zone in force
 * when the event was written (ADR 0008), so travelling west can leave a later
 * event carrying an earlier key than the one before it.
 */
export function intervalIsKnown(
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

/** `at` as the `YYYY-MM-DDTHH:MM` a `datetime-local` input expects. */
export function dateTimeInputValue(at: Date | Instant, timeZone: string): string {
  const wall = wallClockAt(at, timeZone)
  return `${pad(wall.year, 4)}-${pad(wall.month)}-${pad(wall.day)}T${pad(wall.hour)}:${pad(
    wall.minute,
  )}`
}

/** The instant a `datetime-local` value names in `timeZone`. */
export function instantFromDateTimeInput(value: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) throw new RangeError('Enter a date and time')
  return instantAtWallClock(
    {
      year: Number(match[1]!),
      month: Number(match[2]!),
      day: Number(match[3]!),
      hour: Number(match[4]!),
      minute: Number(match[5]!),
    },
    timeZone,
  )
}

const wallTimeFormatters = new Map<string, Intl.DateTimeFormat>()

/** `at` as the local `HH:MM` a user would read off a clock. */
export function formatWallTime(at: Date | Instant, timeZone: string): string {
  let formatter = wallTimeFormatters.get(timeZone)
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
    wallTimeFormatters.set(timeZone, formatter)
  }
  return formatter.format(asDate(at))
}

const logicalDayFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

const logicalDayWithWeekdayFormatter = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

function logicalDayMidday(logicalDay: LogicalDayKey): Date {
  return new Date(`${logicalDay}T12:00:00.000Z`)
}

/** The date a Logical Day starts on, as `29 Aug`. */
export function formatLogicalDay(logicalDay: LogicalDayKey): string {
  return logicalDayFormatter.format(logicalDayMidday(logicalDay))
}

/** The date a Logical Day starts on, as `Sat 29 Aug`. */
export function formatLogicalDayWithWeekday(logicalDay: LogicalDayKey): string {
  return logicalDayWithWeekdayFormatter.format(logicalDayMidday(logicalDay))
}
