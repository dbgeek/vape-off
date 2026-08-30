import type { PuffSession } from '../store/records.ts'
import { logicalDayKeyOf } from './logical-day.ts'

/**
 * The Merge Window: which Puff Session, if any, another tap joins.
 *
 * The window **slides** — every tap pushes it out again — and it **closes at
 * the Logical Day boundary**, so a sitting that straddles 04:00 becomes two
 * Puff Sessions rather than one that silently raises a completed day's total
 * (ADR 0012).
 *
 * The write and the read-out both ask this question, so which Puff Sessions the
 * Window can reach, and which one wins when more than one is open, are decided
 * here rather than at either call site. Callers hand over every Puff Session
 * they hold and take the answer.
 */

const MERGE_WINDOW_MS = 90 * 1000

/**
 * A stretch of negative length is evidence of nothing either way: travelling
 * east can stamp a tap behind the clock it is being compared against.
 */
function windowIsOpen(lastTapAt: string, at: Date): boolean {
  const elapsed = at.getTime() - Date.parse(lastTapAt)
  return elapsed >= 0 && elapsed <= MERGE_WINDOW_MS
}

/** The Puff Session a tap at `at` would join, or undefined if it starts a new one. */
export function openSessionAt(
  sessions: readonly PuffSession[],
  at: Date,
  timeZone: string,
): PuffSession | undefined {
  const logicalDay = logicalDayKeyOf(at, timeZone)
  return sessions
    .filter(
      (session) => session.logicalDay === logicalDay && windowIsOpen(session.lastTapAt, at),
    )
    // The Window is defined off the last tap, so the sitting you are still in is
    // the one whose Window was most recently pushed out.
    .sort((left, right) => Date.parse(right.lastTapAt) - Date.parse(left.lastTapAt))[0]
}
