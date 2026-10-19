import { counted } from './current-gap-format.ts'

const MINUTE_MS = 60 * 1000

/** Spacing's line as Track prints it. */
export interface SpacingText {
  /** `Next in 1h 20m · 4 puffs`, or `Next · now · 4 puffs` once due. */
  text: string
  /** The same reading in words, for a screen reader. */
  words: string
}

/**
 * Spacing's countdown at minute resolution (`screens.md` § Spacing).
 *
 * **Rounded up**, the opposite of the Current Gap's floor and for the same
 * reason: neither says more time has passed than has. From the hour on it
 * keeps two units — `2h 0m` — and never reaches days, the wait being at most
 * the Pace Window's 16 hours. At and past the due time it reads `now`: never
 * negative and never *late*, since a wait you overran is not a debt.
 */
export function formatSpacing({ dueInMs, puffs }: { dueInMs: number; puffs: number }): SpacingText {
  const count = counted(puffs, 'puff')
  if (dueInMs <= 0) {
    return { text: `Next · now · ${count}`, words: `Spacing, due now, ${count}` }
  }

  const totalMinutes = Math.ceil(dueInMs / MINUTE_MS)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0) {
    return {
      text: `Next in ${hours}h ${minutes}m · ${count}`,
      words: `Spacing, next in ${counted(hours, 'hour')} ${counted(minutes, 'minute')}, ${count}`,
    }
  }
  return {
    text: `Next in ${minutes}m · ${count}`,
    words: `Spacing, next in ${counted(minutes, 'minute')}, ${count}`,
  }
}
