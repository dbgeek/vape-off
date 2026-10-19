const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/** The Current Gap as Track prints it. */
export interface CurrentGapText {
  /** `14m`, `2h 14m`, `3d 4h`. */
  text: string
  /** The same reading in words, for a screen reader: `2 hours 14 minutes`. */
  words: string
}

export function counted(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'}`
}

/**
 * The Current Gap at minute resolution, coarsening a unit at the hour and at
 * the day (`screens.md` § The Current Gap).
 *
 * Every unit is floored, so it never claims time that has not passed. Below a
 * day it keeps two units — `2h 0m`, not `2h` — so it does not change width on
 * the hour. There are no seconds: a ticking stopwatch reads as a countdown.
 */
export function formatCurrentGap(milliseconds: number): CurrentGapText {
  const days = Math.floor(milliseconds / DAY_MS)
  const hours = Math.floor((milliseconds % DAY_MS) / HOUR_MS)
  const minutes = Math.floor((milliseconds % HOUR_MS) / MINUTE_MS)

  if (days > 0) {
    return { text: `${days}d ${hours}h`, words: `${counted(days, 'day')} ${counted(hours, 'hour')}` }
  }
  if (hours > 0) {
    return {
      text: `${hours}h ${minutes}m`,
      words: `${counted(hours, 'hour')} ${counted(minutes, 'minute')}`,
    }
  }
  return { text: `${minutes}m`, words: counted(minutes, 'minute') }
}
