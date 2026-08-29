import type { EventStamp, LogicalDayKey } from './records.ts'

export type { EventStamp, LogicalDayKey } from './records.ts'

const LOGICAL_DAY_START_HOUR = 4

function dateTimePartsOf(at: Date, timeZone: string): Intl.DateTimeFormatPart[] {
  return new Intl.DateTimeFormat('en-CA-u-hc-h23', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    timeZoneName: 'longOffset',
    hourCycle: 'h23',
  }).formatToParts(at)
}

function valueOf(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  const value = parts.find((candidate) => candidate.type === type)?.value
  if (value === undefined) throw new RangeError(`Missing ${type} from formatted instant`)
  return value
}

export function logicalDayKeyOf(at: Date, timeZone: string): LogicalDayKey {
  const parts = dateTimePartsOf(at, timeZone)
  const year = Number(valueOf(parts, 'year'))
  const month = Number(valueOf(parts, 'month'))
  const day = Number(valueOf(parts, 'day'))
  const hour = Number(valueOf(parts, 'hour'))
  const date = new Date(Date.UTC(year, month - 1, day - (hour < LOGICAL_DAY_START_HOUR ? 1 : 0)))

  return date.toISOString().slice(0, 10)
}

export function instantOf(at: Date, timeZone: string): string {
  const parts = dateTimePartsOf(at, timeZone)
  const timeZoneName = valueOf(parts, 'timeZoneName')
  const offset = timeZoneName === 'GMT' ? '+00:00' : timeZoneName.replace('GMT', '')

  return `${valueOf(parts, 'year')}-${valueOf(parts, 'month')}-${valueOf(parts, 'day')}T${valueOf(parts, 'hour')}:${valueOf(parts, 'minute')}:${valueOf(parts, 'second')}.${valueOf(parts, 'fractionalSecond')}${offset}`
}

export function stampEvent(
  at: Date,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): EventStamp {
  return {
    at: instantOf(at, timeZone),
    logicalDay: logicalDayKeyOf(at, timeZone),
    tz: timeZone,
  }
}
