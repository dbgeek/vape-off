import { describe, expect, it } from 'vitest'
import type { PuffSession } from '../store/records.ts'
import { logicalDayKeyOf } from './logical-day.ts'
import { openSessionAt } from './merge-window.ts'

/** Stamped the way the store stamps one, so the Logical Day is never asserted by hand. */
function session(id: string, at: string, lastTapAt = at): PuffSession {
  return {
    id,
    at,
    lastTapAt,
    logicalDay: logicalDayKeyOf(new Date(at), 'UTC'),
    count: 1,
    tz: 'UTC',
  }
}

describe('the Merge Window', () => {
  it('joins a tap inside 90 seconds to the Puff Session it lands in', () => {
    const sessions = [session('sitting', '2026-08-29T19:00:00.000Z')]

    expect(openSessionAt(sessions, new Date('2026-08-29T19:01:29.000Z'), 'UTC')?.id).toBe(
      'sitting',
    )
  })

  it('starts a new Puff Session once 90 seconds have passed', () => {
    const sessions = [session('sitting', '2026-08-29T19:00:00.000Z')]

    expect(openSessionAt(sessions, new Date('2026-08-29T19:01:31.000Z'), 'UTC')).toBeUndefined()
  })

  it('closes at the Logical Day boundary, so a sitting across 04:00 is two Puff Sessions', () => {
    const sessions = [session('last night', '2026-08-29T03:59:30.000Z')]
    expect(sessions[0]!.logicalDay).toBe('2026-08-28')

    // Sixty seconds later — well inside the Window, but on the other side of 04:00.
    expect(openSessionAt(sessions, new Date('2026-08-29T04:00:30.000Z'), 'UTC')).toBeUndefined()
  })

  it('slides, so it is measured from the last tap and not from the first', () => {
    // A sitting opened at 19:00 and last tapped at 19:02:40 — 160s after it began.
    const sessions = [
      session('sitting', '2026-08-29T19:00:00.000Z', '2026-08-29T19:02:40.000Z'),
    ]

    expect(openSessionAt(sessions, new Date('2026-08-29T19:04:00.000Z'), 'UTC')?.id).toBe(
      'sitting',
    )
  })

  it('joins the sitting whose Window was pushed out most recently', () => {
    const sessions = [
      // Opened later, but untouched since.
      session('opened later', '2026-08-29T19:00:30.000Z'),
      // Opened first, still being tapped.
      session('tapped later', '2026-08-29T19:00:00.000Z', '2026-08-29T19:01:00.000Z'),
    ]

    expect(openSessionAt(sessions, new Date('2026-08-29T19:01:30.000Z'), 'UTC')?.id).toBe(
      'tapped later',
    )
  })

  it('has nothing to join when the record is empty', () => {
    expect(openSessionAt([], new Date('2026-08-29T19:00:00.000Z'), 'UTC')).toBeUndefined()
  })

  it('refuses a stretch of negative length, which is evidence of nothing either way', () => {
    const sessions = [session('ahead of the clock', '2026-08-29T19:01:00.000Z')]

    expect(openSessionAt(sessions, new Date('2026-08-29T19:00:30.000Z'), 'UTC')).toBeUndefined()
  })
})
