import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { VapeOffDatabase } from '../store/database.ts'
import {
  dateTimeInputValue,
  daysBetween,
  formatLogicalDay,
  formatLogicalDayWithWeekday,
  formatWallTime,
  hourOf,
  instantAtWallClock,
  instantFromDateTimeInput,
  instantOf,
  intervalIsKnown,
  isTimeZone,
  logicalDayKeyOf,
  logicalMinuteOf,
  shiftLogicalDay,
  stampEvent,
  wallClockAt,
} from './logical-day.ts'

const STOCKHOLM = 'Europe/Stockholm'
const NEW_YORK = 'America/New_York'

const databases: VapeOffDatabase[] = []

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.delete()))
})

describe('logicalDayKeyOf', () => {
  it('uses the previous date immediately before the 04:00 boundary', () => {
    expect(logicalDayKeyOf(new Date('2026-08-29T01:59:59.999Z'), STOCKHOLM)).toBe('2026-08-28')
  })

  it('uses the current date at the 04:00 boundary', () => {
    expect(logicalDayKeyOf(new Date('2026-08-29T02:00:00.000Z'), STOCKHOLM)).toBe('2026-08-29')
  })

  it('keeps the boundary at 04:00 local on the day the clocks spring forward', () => {
    // 2026-03-29: Stockholm jumps 02:00 CET to 03:00 CEST, so this Logical Day is 23 hours long.
    expect(logicalDayKeyOf(new Date('2026-03-29T01:59:59.999Z'), STOCKHOLM)).toBe('2026-03-28')
    expect(logicalDayKeyOf(new Date('2026-03-29T02:00:00.000Z'), STOCKHOLM)).toBe('2026-03-29')
  })

  it('keeps the boundary at 04:00 local on the day the clocks fall back', () => {
    // 2026-10-25: Stockholm falls 03:00 CEST to 02:00 CET, so this Logical Day is 25 hours long.
    expect(logicalDayKeyOf(new Date('2026-10-25T02:59:59.999Z'), STOCKHOLM)).toBe('2026-10-24')
    expect(logicalDayKeyOf(new Date('2026-10-25T03:00:00.000Z'), STOCKHOLM)).toBe('2026-10-25')
  })

  it('reads one instant into different Logical Days from different zones', () => {
    const at = new Date('2026-08-29T02:30:00.000Z')
    expect(logicalDayKeyOf(at, STOCKHOLM)).toBe('2026-08-29')
    expect(logicalDayKeyOf(at, NEW_YORK)).toBe('2026-08-28')
  })
})

describe('instantOf', () => {
  it('writes the local wall clock with its offset', () => {
    expect(instantOf(new Date('2026-08-29T02:30:00.000Z'), STOCKHOLM)).toBe(
      '2026-08-29T04:30:00.000+02:00',
    )
  })

  it('writes a negative offset', () => {
    expect(instantOf(new Date('2026-08-29T02:30:00.000Z'), NEW_YORK)).toBe(
      '2026-08-28T22:30:00.000-04:00',
    )
  })

  it('writes a half-hour offset', () => {
    expect(instantOf(new Date('2026-08-29T02:30:00.000Z'), 'Asia/Kolkata')).toBe(
      '2026-08-29T08:00:00.000+05:30',
    )
  })

  it('writes UTC as a zero offset', () => {
    expect(instantOf(new Date('2026-08-29T02:30:00.123Z'), 'UTC')).toBe(
      '2026-08-29T02:30:00.123+00:00',
    )
  })
})

describe('stampEvent', () => {
  it('keeps the Logical Day stamped in the device zone when read in another zone', async () => {
    const db = new VapeOffDatabase(`logical-day-test-${crypto.randomUUID()}`)
    databases.push(db)
    const at = new Date('2026-08-29T02:30:00.000Z')
    const stamp = stampEvent(at, STOCKHOLM)

    expect(stamp.at).toBe('2026-08-29T04:30:00.000+02:00')

    await db.resistedUrges.add({
      id: '79ae9e0b-dd6f-4e54-b3f7-77947eff8a0e',
      ...stamp,
    })

    const stored = await db.resistedUrges.get('79ae9e0b-dd6f-4e54-b3f7-77947eff8a0e')
    expect(stored).toMatchObject({ logicalDay: '2026-08-29', tz: STOCKHOLM })
    expect(logicalDayKeyOf(new Date(stored!.at), NEW_YORK)).toBe('2026-08-28')
  })

  it('stamps the zone the device has moved to, leaving earlier stamps alone', () => {
    const beforeFlying = stampEvent(new Date('2026-08-29T02:30:00.000Z'), STOCKHOLM)
    const afterFlying = stampEvent(new Date('2026-08-29T03:30:00.000Z'), NEW_YORK)

    expect(beforeFlying).toMatchObject({ logicalDay: '2026-08-29', tz: STOCKHOLM })
    expect(afterFlying).toMatchObject({ logicalDay: '2026-08-28', tz: NEW_YORK })
  })
})

describe('wallClockAt', () => {
  it('reads the local wall clock and its offset', () => {
    expect(wallClockAt(new Date('2026-08-29T02:30:45.678Z'), STOCKHOLM)).toEqual({
      year: 2026,
      month: 8,
      day: 29,
      hour: 4,
      minute: 30,
      second: 45,
      millisecond: 678,
      offsetMs: 2 * 60 * 60 * 1000,
    })
  })

  it('accepts a stored Instant as readily as a Date', () => {
    expect(wallClockAt('2026-08-29T04:30:00.000+02:00', 'UTC')).toMatchObject({
      hour: 2,
      minute: 30,
      offsetMs: 0,
    })
  })
})

describe('instantAtWallClock', () => {
  it('solves a wall-clock reading back to the instant it names', () => {
    const at = instantAtWallClock(
      { year: 2026, month: 8, day: 29, hour: 4, minute: 30 },
      STOCKHOLM,
    )
    expect(at.toISOString()).toBe('2026-08-29T02:30:00.000Z')
  })

  it('solves a reading on the far side of a spring-forward', () => {
    const at = instantAtWallClock(
      { year: 2026, month: 3, day: 29, hour: 4, minute: 30 },
      STOCKHOLM,
    )
    expect(at.toISOString()).toBe('2026-03-29T02:30:00.000Z')
    expect(wallClockAt(at, STOCKHOLM)).toMatchObject({ hour: 4, minute: 30 })
  })

  it('solves a reading on the near side of a spring-forward', () => {
    const at = instantAtWallClock(
      { year: 2026, month: 3, day: 29, hour: 1, minute: 30 },
      STOCKHOLM,
    )
    expect(at.toISOString()).toBe('2026-03-29T00:30:00.000Z')
    expect(wallClockAt(at, STOCKHOLM)).toMatchObject({ hour: 1, minute: 30 })
  })

  it('lands on a real instant near the hour a spring-forward skipped', () => {
    // 02:30 never happens in Stockholm on 2026-03-29. There is no right answer,
    // only a defined one: the solve settles on an instant an hour either side.
    const at = instantAtWallClock(
      { year: 2026, month: 3, day: 29, hour: 2, minute: 30 },
      STOCKHOLM,
    )
    expect(at.toISOString()).toBe('2026-03-29T01:30:00.000Z')
    expect(wallClockAt(at, STOCKHOLM)).toMatchObject({ hour: 3, minute: 30 })
  })

  it('solves either side of a fall-back to a real instant', () => {
    const before = instantAtWallClock(
      { year: 2026, month: 10, day: 25, hour: 1, minute: 30 },
      STOCKHOLM,
    )
    const after = instantAtWallClock(
      { year: 2026, month: 10, day: 25, hour: 4, minute: 30 },
      STOCKHOLM,
    )
    expect(before.toISOString()).toBe('2026-10-24T23:30:00.000Z')
    expect(after.toISOString()).toBe('2026-10-25T03:30:00.000Z')
  })

  it('picks one of the two occurrences of a fall-back reading', () => {
    // 02:30 happens twice in Stockholm on 2026-10-25. The solve names the second.
    const at = instantAtWallClock(
      { year: 2026, month: 10, day: 25, hour: 2, minute: 30 },
      STOCKHOLM,
    )
    expect(at.toISOString()).toBe('2026-10-25T01:30:00.000Z')
    expect(wallClockAt(at, STOCKHOLM)).toMatchObject({ hour: 2, minute: 30, offsetMs: 3600000 })
  })

  it('solves in a zone west of UTC', () => {
    const at = instantAtWallClock({ year: 2026, month: 8, day: 29, hour: 22, minute: 30 }, NEW_YORK)
    expect(at.toISOString()).toBe('2026-08-30T02:30:00.000Z')
  })

  it('round-trips every wall clock through the day either DST transition falls on', () => {
    for (const [date, skipped] of [
      ['2026-03-29', 2],
      ['2026-10-25', -1],
    ] as const) {
      const [year, month, day] = date.split('-').map(Number) as [number, number, number]
      for (let hour = 0; hour < 24; hour += 1) {
        if (hour === skipped) continue
        const at = instantAtWallClock({ year, month, day, hour, minute: 15 }, STOCKHOLM)
        expect(wallClockAt(at, STOCKHOLM)).toMatchObject({ hour, minute: 15 })
      }
    }
  })
})

describe('hourOf', () => {
  it('reads the wall-clock hour in the zone the event was stamped in', () => {
    expect(hourOf('2026-08-29T04:30:00.000+02:00', STOCKHOLM)).toBe(4)
    expect(hourOf('2026-08-29T04:30:00.000+02:00', NEW_YORK)).toBe(22)
  })
})

describe('logicalMinuteOf', () => {
  it('opens the Logical Day at zero', () => {
    expect(logicalMinuteOf('2026-08-29T04:00:00.000+02:00', STOCKHOLM)).toBe(0)
  })

  it('closes the Logical Day just short of a full day', () => {
    expect(logicalMinuteOf('2026-08-29T03:59:00.000+02:00', STOCKHOLM)).toBe(24 * 60 - 1)
  })

  it('counts from 04:00, not from midnight', () => {
    expect(logicalMinuteOf('2026-08-29T06:30:00.000+02:00', STOCKHOLM)).toBe(150)
    expect(logicalMinuteOf('2026-08-29T00:30:00.000+02:00', STOCKHOLM)).toBe(20 * 60 + 30)
  })
})

describe('shiftLogicalDay', () => {
  it('moves forward and back across a month boundary', () => {
    expect(shiftLogicalDay('2026-08-31', 1)).toBe('2026-09-01')
    expect(shiftLogicalDay('2026-09-01', -1)).toBe('2026-08-31')
  })

  it('moves across a year boundary and a leap day', () => {
    expect(shiftLogicalDay('2026-12-31', 1)).toBe('2027-01-01')
    expect(shiftLogicalDay('2028-02-28', 1)).toBe('2028-02-29')
  })

  it('is unmoved by daylight saving, because a key is a date and not a duration', () => {
    expect(shiftLogicalDay('2026-03-28', 1)).toBe('2026-03-29')
    expect(shiftLogicalDay('2026-10-24', 1)).toBe('2026-10-25')
  })
})

describe('daysBetween', () => {
  it('counts whole days from start to end', () => {
    expect(daysBetween('2026-08-01', '2026-08-08')).toBe(7)
    expect(daysBetween('2026-08-08', '2026-08-01')).toBe(-7)
    expect(daysBetween('2026-08-01', '2026-08-01')).toBe(0)
  })

  it('counts a whole day across a daylight-saving transition', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2)
  })
})

describe('intervalIsKnown', () => {
  const known = new Set(['2026-08-01', '2026-08-02', '2026-08-03'])

  it('accepts an interval whose every day is Known', () => {
    expect(intervalIsKnown(known, '2026-08-01', '2026-08-03')).toBe(true)
    expect(intervalIsKnown(known, '2026-08-02', '2026-08-02')).toBe(true)
  })

  it('rejects an interval crossing an Unknown Logical Day', () => {
    expect(intervalIsKnown(known, '2026-08-01', '2026-08-04')).toBe(false)
    expect(intervalIsKnown(new Set(['2026-08-01', '2026-08-03']), '2026-08-01', '2026-08-03')).toBe(
      false,
    )
  })

  it('rejects an interval that runs backwards', () => {
    expect(intervalIsKnown(known, '2026-08-03', '2026-08-01')).toBe(false)
  })
})

describe('dateTimeInputValue', () => {
  it('writes the local wall clock in the form a datetime-local input takes', () => {
    expect(dateTimeInputValue(new Date('2026-08-29T02:30:00.000Z'), STOCKHOLM)).toBe(
      '2026-08-29T04:30',
    )
    expect(dateTimeInputValue('2026-08-29T04:30:00.000+02:00', NEW_YORK)).toBe('2026-08-28T22:30')
  })
})

describe('instantFromDateTimeInput', () => {
  it('reads a datetime-local value as a wall clock in the given zone', () => {
    expect(instantFromDateTimeInput('2026-08-29T04:30', STOCKHOLM).toISOString()).toBe(
      '2026-08-29T02:30:00.000Z',
    )
  })

  it('round-trips with dateTimeInputValue', () => {
    for (const zone of [STOCKHOLM, NEW_YORK, 'UTC', 'Asia/Kolkata']) {
      const value = '2026-08-29T04:30'
      expect(dateTimeInputValue(instantFromDateTimeInput(value, zone), zone)).toBe(value)
    }
  })

  it('round-trips a reading on the far side of a spring-forward', () => {
    const value = '2026-03-29T04:30'
    expect(dateTimeInputValue(instantFromDateTimeInput(value, STOCKHOLM), STOCKHOLM)).toBe(value)
  })

  it('round-trips a reading after a fall-back', () => {
    const value = '2026-10-25T04:30'
    expect(dateTimeInputValue(instantFromDateTimeInput(value, STOCKHOLM), STOCKHOLM)).toBe(value)
  })

  it('rejects anything that is not a datetime-local value', () => {
    expect(() => instantFromDateTimeInput('', STOCKHOLM)).toThrow(RangeError)
    expect(() => instantFromDateTimeInput('2026-08-29', STOCKHOLM)).toThrow(
      'Enter a date and time',
    )
  })
})

describe('formatting', () => {
  it('reads a wall time off the clock in the given zone', () => {
    expect(formatWallTime('2026-08-29T02:05:00.000Z', STOCKHOLM)).toBe('04:05')
    expect(formatWallTime(new Date('2026-08-29T02:05:00.000Z'), NEW_YORK)).toBe('22:05')
  })

  it('names the date a Logical Day starts on', () => {
    expect(formatLogicalDay('2026-08-29')).toBe('29 Aug')
    expect(formatLogicalDayWithWeekday('2026-08-29')).toBe('Sat 29 Aug')
  })
})

describe('isTimeZone', () => {
  it('recognises an IANA identifier', () => {
    expect(isTimeZone(STOCKHOLM)).toBe(true)
    expect(isTimeZone('UTC')).toBe(true)
  })

  it('rejects anything the runtime cannot resolve', () => {
    expect(isTimeZone('Mars/Olympus_Mons')).toBe(false)
    expect(isTimeZone('')).toBe(false)
  })
})
