import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BackupSource, PreparedRestore } from '../backup/browser-backup-source.ts'
import type { DayLedgerRecord } from '../domain/day-ledger.ts'
import type { ClearDay, PuffSession, RatchetStep, ResistedUrge } from '../store/records.ts'
import { LONG_PRESS_MS } from './mark-gesture.ts'
import { TrackScreen, type TrackSource } from './TrackScreen.tsx'

const emptyRecord: DayLedgerRecord = {
  puffSessions: [],
  resistedUrges: [],
  clearDays: [],
  ratchetSteps: [],
}

function session(id: string, at: string, count: number, lastTapAt = at): PuffSession {
  return { id, at, lastTapAt, count, logicalDay: '2026-08-29', tz: 'UTC' }
}

/** The same Puff Session, marked as having delivered a Kick. */
function marked(session: PuffSession): PuffSession {
  return { ...session, kickMarkedAt: '2026-08-29T23:00:00.000Z' }
}

function resistedUrge(at: string): ResistedUrge {
  return { id: 'resisted', at, logicalDay: '2026-08-29', tz: 'UTC' }
}

/** The Logical Day before the 29th every clock in this file is reading. */
const YESTERDAY = '2026-08-28'

function sessionOn(logicalDay: string, id: string, at: string, count: number): PuffSession {
  return { id, at, lastTapAt: at, count, logicalDay, tz: 'UTC' }
}

function yesterdaySession(id: string, at: string, count: number): PuffSession {
  return sessionOn(YESTERDAY, id, at, count)
}

function yesterdayUrge(id: string, at: string): ResistedUrge {
  return { id, at, logicalDay: YESTERDAY, tz: 'UTC' }
}

function yesterdayClearDay(): ClearDay {
  return { logicalDay: YESTERDAY, at: `${YESTERDAY}T12:00:00.000Z`, tz: 'UTC' }
}

function target(value: number): RatchetStep {
  return {
    id: 'target',
    effectiveFrom: '2026-08-20',
    target: value,
    kind: 'earned',
    at: '2026-08-20T04:00:00.000Z',
  }
}

/** The height an element hangs at, as the percentage the timeline positioned it by. */
function topPercent(element: HTMLElement): number {
  return Number.parseFloat(element.style.top)
}

/** Every element the timeline draws for `selector`, in the order it drew them. */
function timelineElements(selector: string): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(selector)]
}

/** The one element the timeline draws for `selector` — a readable failure if it draws none. */
function timelineElement(selector: string): HTMLElement {
  const drawn = document.querySelectorAll<HTMLElement>(selector)
  if (drawn.length !== 1) {
    throw new Error(`Expected one ${selector} on the timeline, found ${drawn.length}`)
  }
  return drawn[0]!
}

/**
 * Give the timeline a real box, because the fan is a distance in pixels and
 * jsdom lays nothing out. The default is the 335px-wide timeline an iPhone SE
 * produces, at the height `screens.md` reads its *a 20px mark covers roughly 55
 * minutes* off.
 */
function measureTimeline(width = 335, height = 520) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: Element,
  ) {
    const box = this.classList.contains('timeline') ? { width, height } : { width: 0, height: 0 }
    return { ...box, top: 0, left: 0, right: box.width, bottom: box.height, x: 0, y: 0 } as DOMRect
  })
}

function source(record: DayLedgerRecord): TrackSource {
  return {
    load: vi.fn().mockResolvedValue(record),
    loadFirstRunCardDismissed: vi.fn().mockResolvedValue(true),
    logPuff: vi.fn().mockResolvedValue(record),
    logResistedUrge: vi.fn().mockResolvedValue(record),
    dismissFirstRunCard: vi.fn().mockResolvedValue(undefined),
    declareClearDay: vi.fn().mockResolvedValue(record),
    correct: vi.fn().mockResolvedValue({ status: 'corrected', record }),
    toggleKick: vi.fn().mockResolvedValue(record),
    declareHandover: vi.fn().mockResolvedValue(record),
  }
}

describe('Track', () => {
  afterEach(() => vi.restoreAllMocks())

  it('shows the Logical Day with now on the axis, its two event forms, and fixed one-tap actions', async () => {
    const record = {
      ...emptyRecord,
      puffSessions: [
        session('morning', '2026-08-29T10:00:00.000Z', 7),
        session(
          'open',
          '2026-08-29T19:00:00.000Z',
          2,
          '2026-08-29T19:01:00.000Z',
        ),
      ],
      resistedUrges: [resistedUrge('2026-08-29T14:00:00.000Z')],
      ratchetSteps: [target(24)],
    }
    const trackSource = source(record)

    render(
      <TrackScreen
        source={trackSource}
        clock={{ now: () => new Date('2026-08-29T19:02:00.000Z'), timeZone: () => 'UTC' }}
      />,
    )

    expect(await screen.findByText('9 / 24')).toBeInTheDocument()
    expect(screen.getByText('04:00', { selector: '.track-boundary-start' })).toBeInTheDocument()
    expect(screen.getByText('04:00', { selector: '.track-boundary-end' })).toBeInTheDocument()
    // 19:02 is 15h02m into a Logical Day that opened at 04:00 — five eighths of
    // the way down, not the middle. The line divides nothing and sizes nothing.
    expect(screen.getByText('now')).toBeInTheDocument()
    expect(topPercent(timelineElement('.now-line'))).toBeCloseTo(62.639, 3)
    expect(screen.getByLabelText('Puff Session, 7 puffs at 10:00')).toBeInTheDocument()
    expect(screen.getByLabelText('Resisted Urge at 14:00')).toBeInTheDocument()
    expect(screen.getByText('Open session · 2 puffs')).toHaveClass('open-session')
    expect(screen.getByRole('button', { name: '+1 → 3' })).toBeInTheDocument()
    expect(screen.getAllByLabelText(/Pace slot at/).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: '+1 → 3' }))
    await waitFor(() => expect(trackSource.logPuff).toHaveBeenCalledTimes(1))
    expect(trackSource.logPuff).toHaveBeenCalledWith(new Date('2026-08-29T19:02:00.000Z'))

    fireEvent.click(screen.getByRole('button', { name: 'Resisted' }))
    await waitFor(() => expect(trackSource.logResistedUrge).toHaveBeenCalledTimes(1))
  })

  it('hangs a Puff Session at the same height whatever the hour, and whatever the Logical Day', async () => {
    async function heightOf(logicalDay: string, nowWallTime: string): Promise<number> {
      const view = render(
        <TrackScreen
          source={source({
            ...emptyRecord,
            puffSessions: [{ ...session('fixed', `${logicalDay}T19:00:00.000Z`, 1), logicalDay }],
          })}
          clock={{ now: () => new Date(`${logicalDay}T${nowWallTime}:00.000Z`), timeZone: () => 'UTC' }}
        />,
      )
      const mark = await within(view.container).findByLabelText(/Puff Session/)
      const top = topPercent(mark)
      view.unmount()
      return top
    }

    // 19:00 is 15 hours into the Logical Day: 62.5% down, and it stays there.
    expect(await heightOf('2026-08-29', '07:51')).toBeCloseTo(62.5)
    expect(await heightOf('2026-08-29', '14:10')).toBeCloseTo(62.5)
    expect(await heightOf('2026-08-29', '21:30')).toBeCloseTo(62.5)
    expect(await heightOf('2026-06-14', '21:30')).toBeCloseTo(62.5)
  })

  it('puts two Puff Sessions two minutes apart a fraction of a percent apart', async () => {
    render(
      <TrackScreen
        source={source({
          ...emptyRecord,
          puffSessions: [
            session('first', '2026-08-29T04:01:00.000Z', 1),
            session('second', '2026-08-29T04:03:00.000Z', 1),
          ],
        })}
        clock={{ now: () => new Date('2026-08-29T08:00:00.000Z'), timeZone: () => 'UTC' }}
      />,
    )

    const first = await screen.findByLabelText('Puff Session, 1 puff at 04:01')
    const second = screen.getByLabelText('Puff Session, 1 puff at 04:03')
    expect(topPercent(second) - topPercent(first)).toBeCloseTo(0.139, 3)
  })

  it('sizes each mark by its own count alone, and prints that count inside it', async () => {
    render(
      <TrackScreen
        source={source({
          ...emptyRecord,
          puffSessions: [
            session('two', '2026-08-29T06:00:00.000Z', 2),
            session('three', '2026-08-29T08:00:00.000Z', 3),
            session('five', '2026-08-29T10:00:00.000Z', 5),
            session('six', '2026-08-29T12:00:00.000Z', 6),
            session('ten', '2026-08-29T14:00:00.000Z', 10),
            session('eleven', '2026-08-29T16:00:00.000Z', 11),
            session('forty', '2026-08-29T18:00:00.000Z', 40),
          ],
        })}
        clock={{ now: () => new Date('2026-08-29T20:00:00.000Z'), timeZone: () => 'UTC' }}
      />,
    )

    await screen.findByLabelText(/Puff Session, 2 puffs/)
    const marks = timelineElements('.puff-mark')
    expect(marks.map((mark) => mark.style.width)).toEqual([
      '20px',
      '28px',
      '28px',
      '36px',
      '36px',
      '44px',
      '44px',
    ])
    expect(marks.map((mark) => mark.style.height)).toEqual(marks.map((mark) => mark.style.width))
    // The numeral is the exact value; size is only the at-a-glance channel, so
    // it is printed inside every mark including the smallest tier's.
    expect(marks.map((mark) => mark.textContent)).toEqual(['2', '3', '5', '6', '10', '11', '40'])
  })

  it('draws a Puff Session the same size on a quiet day as on a heavy one', async () => {
    async function widthOfThreePuffMark(...counts: number[]): Promise<string> {
      const view = render(
        <TrackScreen
          source={source({
            ...emptyRecord,
            puffSessions: counts.map((count, index) =>
              session(`session-${index}`, `2026-08-29T0${index + 6}:00:00.000Z`, count),
            ),
          })}
          clock={{ now: () => new Date('2026-08-29T20:00:00.000Z'), timeZone: () => 'UTC' }}
        />,
      )
      const mark = await within(view.container).findByLabelText(/Puff Session, 3 puffs/)
      const width = mark.style.width
      view.unmount()
      return width
    }

    // The day's largest is 3, and then 40. Improving cannot inflate your own marks.
    expect(await widthOfThreePuffMark(3)).toBe('28px')
    expect(await widthOfThreePuffMark(3, 40)).toBe('28px')
  })

  it('fixes the Resisted Urge ring at 14px, carrying no numeral', async () => {
    render(
      <TrackScreen
        source={source({
          ...emptyRecord,
          puffSessions: [session('one', '2026-08-29T06:00:00.000Z', 1)],
          resistedUrges: [resistedUrge('2026-08-29T14:00:00.000Z')],
        })}
        clock={{ now: () => new Date('2026-08-29T20:00:00.000Z'), timeZone: () => 'UTC' }}
      />,
    )

    await screen.findByLabelText(/Puff Session/)
    const ring = timelineElement('.resisted-mark')
    expect(ring.style.width).toBe('14px')
    expect(ring.style.height).toBe('14px')
    expect(ring.textContent).toBe('')
  })

  it('fans marks that collide sideways, each keeping its height and a spoke back to the spine', async () => {
    measureTimeline()
    render(
      <TrackScreen
        source={source({
          ...emptyRecord,
          puffSessions: [
            session('ten', '2026-08-29T07:34:00.000Z', 10),
            session('six', '2026-08-29T07:38:00.000Z', 6),
          ],
        })}
        clock={{ now: () => new Date('2026-08-29T07:51:00.000Z'), timeZone: () => 'UTC' }}
      />,
    )

    await screen.findByLabelText(/Puff Session, 10 puffs/)
    const [ten, six] = timelineElements('.puff-mark')

    // The reported blob: four minutes apart, and four minutes apart is where
    // they stay. Nothing is displaced through time and nothing is merged.
    expect(topPercent(six!)).toBeGreaterThan(topPercent(ten!))
    expect(topPercent(six!) - topPercent(ten!)).toBeCloseTo(0.2778, 4)
    // The 10 keeps the spine; the 6 steps one column right — its own 36px mark
    // plus the 4px the step adds.
    expect(ten!.style.left).toBe('')
    expect(six!.style.left).toBe('calc(var(--spine) + 40px)')

    const spoke = timelineElement('.fan-spoke')
    expect(spoke.style.width).toBe('40px')
    expect(topPercent(spoke)).toBeCloseTo(topPercent(six!))

    // The column is measured from the spine, and the spine is one number: the
    // stylesheet keeps no copy of it, so it has to arrive here for anything on
    // the timeline to be positioned at all.
    expect(timelineElement('.timeline').style.getPropertyValue('--spine')).toBe('46%')
  })

  it('fans a Resisted Urge ring with everything else, at its own size', async () => {
    measureTimeline()
    render(
      <TrackScreen
        source={source({
          ...emptyRecord,
          puffSessions: [session('mark', '2026-08-29T15:12:00.000Z', 2)],
          resistedUrges: [resistedUrge('2026-08-29T15:12:00.000Z')],
        })}
        clock={{ now: () => new Date('2026-08-29T16:00:00.000Z'), timeZone: () => 'UTC' }}
      />,
    )

    await screen.findByLabelText(/Puff Session, 2 puffs/)
    // The ring lands on the same minute as the session, so it cannot stay on the
    // spine — and it keeps its own 14px while stepping by the group's widest.
    const ring = timelineElement('.resisted-mark')
    expect(ring.style.left).toBe('calc(var(--spine) + 24px)')
    expect(ring.style.width).toBe('14px')
  })

  it('tones the live lane below the now-line, as one region starting at now', async () => {
    const { container } = render(
      <TrackScreen
        source={source(emptyRecord)}
        clock={{ now: () => new Date('2026-08-29T10:00:00.000Z'), timeZone: () => 'UTC' }}
      />,
    )

    await screen.findByLabelText('Logical Day timeline')
    // One region, starting where the now-line is and running to the closing
    // 04:00 — tone over the hours that have not happened, sizing and
    // displacing nothing.
    expect(topPercent(timelineElement('.timeline-unlived'))).toBeCloseTo(
      topPercent(timelineElement('.now-line')),
    )
    expect(container.querySelector('.timeline-unlived')).toHaveAttribute('aria-hidden', 'true')
  })

  it('shows the count alone when the view carries no Target', async () => {
    render(
      <TrackScreen
        source={source({
          ...emptyRecord,
          puffSessions: [session('baseline', '2026-08-29T10:00:00.000Z', 3)],
        })}
        clock={{ now: () => new Date('2026-08-29T12:00:00.000Z'), timeZone: () => 'UTC' }}
      />,
    )

    expect(await screen.findByLabelText('Puffs today')).toHaveTextContent('3')
    expect(screen.getByLabelText('Puffs today')).toHaveClass('track-count')
  })

  it('draws a Kick as a halo the mark wears, keeping everything the mark already was', async () => {
    render(
      <TrackScreen
        source={source({
          ...emptyRecord,
          puffSessions: [
            marked(session('morning', '2026-08-29T10:00:00.000Z', 2)),
            marked(session('open', '2026-08-29T19:00:00.000Z', 2, '2026-08-29T19:01:00.000Z')),
          ],
          ratchetSteps: [target(2)],
        })}
        clock={{ now: () => new Date('2026-08-29T19:02:00.000Z'), timeZone: () => 'UTC' }}
      />,
    )

    // The Kick is a ring drawn *outside* the mark, which is nothing at all to a
    // reader who cannot see it — so the label is where it is said.
    const morning = await screen.findByLabelText('Puff Session, 2 puffs at 10:00, Kicked')
    const open = screen.getByLabelText('Puff Session, 2 puffs at 19:00, Kicked')
    expect(morning).toHaveClass('puff-mark', 'kicked')

    // Every existing signal survives untouched: the tier, the printed numeral,
    // the over-Target red and the open-session pulse. A Kicked over-Target mark
    // draws **both** rings — neither has standing to censor the other.
    expect(open).toHaveClass('puff-mark', 'over-target', 'open-mark', 'kicked')
    expect([morning, open].map((mark) => mark.style.width)).toEqual(['20px', '20px'])
    expect([morning, open].map((mark) => mark.style.height)).toEqual(['20px', '20px'])
    expect([morning, open].map((mark) => mark.textContent)).toEqual(['2', '2'])

    // The halo is a `box-shadow`, which is not hit-tested: a Kicked mark's
    // handle is exactly the handle it was.
    fireEvent.click(morning)
    expect(screen.getByRole('dialog', { name: 'Edit Puff Session' })).toBeInTheDocument()
  })

  it('says nothing of a Puff Session nobody marked, because an unmarked one is Unknown', async () => {
    render(
      <TrackScreen
        source={source({
          ...emptyRecord,
          puffSessions: [session('quiet', '2026-08-29T10:00:00.000Z', 2)],
        })}
        clock={{ now: () => new Date('2026-08-29T12:00:00.000Z'), timeZone: () => 'UTC' }}
      />,
    )

    // There is no `false` to draw and none to read aloud (ADR 0015): absence is
    // *you did not say*, never *it delivered nothing*.
    const quiet = await screen.findByLabelText('Puff Session, 2 puffs at 10:00')
    expect(quiet).not.toHaveClass('kicked')
    expect(screen.queryByLabelText(/Kicked/)).not.toBeInTheDocument()
  })

  it('states when Target was reached and colors only later Puff Sessions red', async () => {
    render(
      <TrackScreen
        source={source({
          ...emptyRecord,
          puffSessions: [
            session('first', '2026-08-29T10:00:00.000Z', 2),
            session('reached', '2026-08-29T19:04:00.000Z', 2),
            session('later', '2026-08-29T20:00:00.000Z', 1),
          ],
          ratchetSteps: [target(4)],
        })}
        clock={{ now: () => new Date('2026-08-29T21:00:00.000Z'), timeZone: () => 'UTC' }}
      />,
    )

    const fact = await screen.findByText('Target reached 19:04')
    expect(fact.parentElement).toHaveClass('target-reached')
    expect(screen.getByLabelText('Puff Session, 2 puffs at 19:04')).not.toHaveClass('over-target')
    expect(screen.getByLabelText('Puff Session, 1 puff at 20:00')).toHaveClass('over-target')
    expect(screen.queryByText(/failed|limit|should|warning/i)).not.toBeInTheDocument()
  })

  it('queues every blind tap while the previous write is still settling', async () => {
    let settleFirstWrite!: (record: DayLedgerRecord) => void
    const firstWrite = new Promise<DayLedgerRecord>((resolve) => {
      settleFirstWrite = resolve
    })
    const trackSource = source(emptyRecord)
    vi.mocked(trackSource.logPuff)
      .mockImplementationOnce(() => firstWrite)
      .mockResolvedValueOnce(emptyRecord)

    render(
      <TrackScreen
        source={trackSource}
        clock={{ now: () => new Date('2026-08-29T12:00:00.000Z'), timeZone: () => 'UTC' }}
      />,
    )
    await screen.findByLabelText('Puffs today')

    fireEvent.click(screen.getByRole('button', { name: 'PUFF' }))
    fireEvent.click(screen.getByRole('button', { name: 'PUFF' }))
    await waitFor(() => expect(trackSource.logPuff).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: 'PUFF' })).not.toBeDisabled()

    settleFirstWrite(emptyRecord)
    await waitFor(() => expect(trackSource.logPuff).toHaveBeenCalledTimes(2))
  })

  it('greets a new user over live Track once and gives the complete restore account', async () => {
    const trackSource = source(emptyRecord)
    vi.mocked(trackSource.loadFirstRunCardDismissed).mockResolvedValue(false)

    render(
      <TrackScreen
        source={trackSource}
        installed={false}
        clock={{ now: () => new Date('2026-08-29T12:00:00.000Z'), timeZone: () => 'UTC' }}
      />,
    )

    expect(await screen.findByText(/first week just measures/i)).toBeInTheDocument()
    expect(screen.getByText(/seven days of logging/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'PUFF' })).toBeInTheDocument()
    expect(screen.getByText(/Used vape-off before?/)).toBeInTheDocument()
    expect(screen.queryByText(/Start fresh/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Restore from a backup/i }))
    expect(document.querySelector('.restore-account')).toHaveTextContent(/behind a second icon/i)
    expect(screen.getByText(/other icon has to still exist/i)).toBeInTheDocument()
    expect(screen.getByText(/Install vape-off before restoring/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss welcome' }))
    await waitFor(() => expect(trackSource.dismissFirstRunCard).toHaveBeenCalledOnce())
    expect(screen.queryByText(/first week just measures/i)).not.toBeInTheDocument()
  })

  it('restores from the first-run door when installed', async () => {
    const restoredRecord: DayLedgerRecord = {
      ...emptyRecord,
      clearDays: [{
        logicalDay: '2026-08-20',
        at: '2026-08-20T20:00:00.000Z',
        tz: 'UTC',
      }],
    }
    const trackSource = source(emptyRecord)
    vi.mocked(trackSource.load)
      .mockResolvedValueOnce(emptyRecord)
      .mockResolvedValueOnce(restoredRecord)
    vi.mocked(trackSource.loadFirstRunCardDismissed).mockResolvedValue(false)
    const prepared: PreparedRestore = {
      installId: 'source-install',
      logicalDayCount: 1,
      record: { ...restoredRecord, exports: [] },
    }
    const backupSource: BackupSource = {
      load: vi.fn(),
      backUp: vi.fn(),
      prepareRestore: vi.fn().mockResolvedValue(prepared),
      restore: vi.fn().mockResolvedValue(undefined),
      recover: vi.fn().mockResolvedValue(undefined),
    }
    render(
      <TrackScreen
        source={trackSource}
        backupSource={backupSource}
        installed
        clock={{ now: () => new Date('2026-08-29T12:00:00.000Z'), timeZone: () => 'UTC' }}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: /Restore from a backup/i }))
    fireEvent.change(screen.getByLabelText('Choose a backup file'), {
      target: { files: [new File(['{}'], 'backup.json')] },
    })

    await waitFor(() => expect(backupSource.restore).toHaveBeenCalledWith(prepared))
    expect(await screen.findByText('Backup restored.')).toBeInTheDocument()
    expect(trackSource.dismissFirstRunCard).toHaveBeenCalledOnce()
    expect(screen.queryByText(/first week just measures/i)).not.toBeInTheDocument()
  })

  it('renders a catch-up card per offered Unknown Logical Day, without debt framing', async () => {
    const trackSource = source({
      ...emptyRecord,
      resistedUrges: [
        { id: 'old', at: '2026-08-14T12:00:00.000Z', logicalDay: '2026-08-14', tz: 'UTC' },
      ],
    })
    render(
      <TrackScreen
        source={trackSource}
        clock={{ now: () => new Date('2026-08-29T12:00:00.000Z'), timeZone: () => 'UTC' }}
      />,
    )

    const strip = await screen.findByRole('region', { name: 'Catch up' })
    expect(within(strip).getAllByRole('article')).toHaveLength(7)
    // Both sentences survive the compaction: the second is the one holding the
    // *offer, never a debt* framing, and it is not what gives when the row is
    // tight (`screens.md` § The catch-up strip).
    expect(strip).toHaveTextContent('Anything you remember?')
    expect(strip).toHaveTextContent('It is fine to leave a day unknown.')
    expect(strip).not.toHaveTextContent(/missed|owe|overdue/i)

    // Each day is one chip carrying both actions as glyphs. The glyph is what
    // is drawn; the whole sentence is still what an assistive technology reads,
    // and it names the day, because a row of chips has no other context to
    // borrow one from.
    const chip = within(strip).getAllByRole('article')[0]!
    expect(chip).toHaveTextContent('Sat 22 Aug')
    expect(within(chip).getAllByRole('button')).toHaveLength(2)
    within(chip).getByRole('button', { name: 'Add what I remember for Sat 22 Aug' })

    fireEvent.click(within(chip).getByRole('button', { name: 'Mark Sat 22 Aug a Clear Day' }))
    await waitFor(() => expect(trackSource.declareClearDay).toHaveBeenCalledOnce())
  })

  it('allows today to be declared Clear and surfaces the earned handover at Target 1', async () => {
    const clearDays = ['22', '23', '24', '25', '26'].map((day) => ({
      at: `2026-08-${day}T12:00:00.000Z`,
      logicalDay: `2026-08-${day}`,
      tz: 'UTC',
    }))
    const record = {
      ...emptyRecord,
      clearDays,
      ratchetSteps: [target(1)],
    }
    const trackSource = source(record)
    render(
      <TrackScreen
        source={trackSource}
        clock={{ now: () => new Date('2026-08-29T12:00:00.000Z'), timeZone: () => 'UTC' }}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Declare today a Clear Day' }))
    await waitFor(() => expect(trackSource.declareClearDay).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: 'Set Target to 0' }))
    await waitFor(() => expect(trackSource.declareHandover).toHaveBeenCalledOnce())
  })

  it('opens a Puff Session for a cheap count correction and a hard delete', async () => {
    const record = {
      ...emptyRecord,
      puffSessions: [session('morning', '2026-08-29T10:00:00.000Z', 2)],
    }
    const trackSource = source(record)
    render(
      <TrackScreen
        source={trackSource}
        clock={{ now: () => new Date('2026-08-29T12:00:00.000Z'), timeZone: () => 'UTC' }}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Puff Session, 2 puffs at 10:00' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit Puff Session' })
    fireEvent.change(within(dialog).getByLabelText('Puff count'), { target: { value: '3' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(trackSource.correct).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'update-puff-session', id: 'morning', count: 3 }),
      ),
    )
    expect(screen.queryByText(/Are you sure/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Puff Session, 2 puffs at 10:00' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    await waitFor(() =>
      expect(trackSource.correct).toHaveBeenCalledWith({
        kind: 'delete-puff-session',
        id: 'morning',
      }),
    )
  })

  it('names a Momentum change before a backfilled Puff Session lands', async () => {
    const record = {
      ...emptyRecord,
      clearDays: [
        { at: '2026-08-28T12:00:00.000Z', logicalDay: '2026-08-28', tz: 'UTC' },
      ],
      ratchetSteps: [target(2)],
    }
    const trackSource = source(record)
    render(
      <TrackScreen
        source={trackSource}
        clock={{ now: () => new Date('2026-08-29T12:00:00.000Z'), timeZone: () => 'UTC' }}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Add past event' }))
    const dialog = screen.getByRole('dialog', { name: 'Add to the record' })
    fireEvent.change(within(dialog).getByLabelText('Time'), {
      target: { value: '2026-08-28T12:00' },
    })
    fireEvent.change(within(dialog).getByLabelText('Puff count'), { target: { value: '3' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    expect(screen.getByText('This will change your momentum from 1 to 0.')).toBeInTheDocument()
    expect(trackSource.correct).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Apply change' }))
    await waitFor(() =>
      expect(trackSource.correct).toHaveBeenCalledWith({
        kind: 'add-puff-session',
        at: new Date('2026-08-28T12:00:00.000Z'),
        count: 3,
      }),
    )
  })

  it('keeps the editor open for invalid counts and future events', async () => {
    const trackSource = source(emptyRecord)
    render(
      <TrackScreen
        source={trackSource}
        clock={{ now: () => new Date('2026-08-29T12:00:00.000Z'), timeZone: () => 'UTC' }}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Add past event' }))
    const dialog = screen.getByRole('dialog', { name: 'Add to the record' })
    fireEvent.change(within(dialog).getByLabelText('Puff count'), { target: { value: '0' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    expect(within(dialog).getByText('Enter a whole puff count of at least 1.')).toBeInTheDocument()
    expect(trackSource.correct).not.toHaveBeenCalled()

    fireEvent.change(within(dialog).getByLabelText('Puff count'), { target: { value: '1' } })
    fireEvent.change(within(dialog).getByLabelText('Time'), {
      target: { value: '2026-08-30T12:00' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    expect(within(dialog).getByText('Choose a time that has already happened.')).toBeInTheDocument()
    expect(trackSource.correct).not.toHaveBeenCalled()
  })

  it('re-evaluates the Ratchet when the app returns to view', async () => {
    const trackSource = source({ ...emptyRecord, ratchetSteps: [target(24)] })
    render(
      <TrackScreen
        source={trackSource}
        clock={{ now: () => new Date('2026-08-29T12:00:00.000Z'), timeZone: () => 'UTC' }}
      />,
    )
    await screen.findByText('0 / 24')

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(trackSource.load).toHaveBeenCalledTimes(1)

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))

    await waitFor(() => expect(trackSource.load).toHaveBeenCalledTimes(2))
  })

  it('surfaces a Correction the record refused, after the editor has closed', async () => {
    // propose() has already refused anything it can judge, so this is a
    // backstop — but the editor is gone by the time it answers, and a silent
    // refusal reads as a tap that did nothing.
    const trackSource = source(emptyRecord)
    vi.mocked(trackSource.correct).mockResolvedValue({
      status: 'refused',
      reason: 'in-the-future',
    })
    render(
      <TrackScreen
        source={trackSource}
        clock={{ now: () => new Date('2026-08-29T12:00:00.000Z'), timeZone: () => 'UTC' }}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Add past event' }))
    const dialog = screen.getByRole('dialog', { name: 'Add to the record' })
    fireEvent.change(within(dialog).getByLabelText('Time'), {
      target: { value: '2026-08-28T12:00' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Choose a time that has already happened.')
    expect(screen.queryByRole('dialog', { name: 'Add to the record' })).not.toBeInTheDocument()
    expect(screen.queryByText('Track could not read your record.')).not.toBeInTheDocument()
  })
})

/**
 * Marking a Kick: **the mark is the whole surface, two routes and one act**
 * (`screens.md` § Marking a Kick).
 *
 * The gesture's own claims are `mark-gesture.test.ts`'s. What is asked here is
 * the other half of the question — *which* marks are handed it, what the second
 * route does, and what the screen does **not** grow to carry either of them.
 */
describe('Marking a Kick', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  /** The same Puff Session with its Kick taken back — the property is deleted, never falsified. */
  function unmarked({ kickMarkedAt, ...session }: PuffSession): PuffSession {
    return session
  }

  /**
   * A source whose record actually moves under a Kick.
   *
   * The toggle's on-state is read off the record rather than off the editor's
   * own state, so a fake answering with one frozen record could not tell a
   * toggle that applied from one that did nothing — which is the single claim
   * this whole surface turns on.
   */
  function markingSource(record: DayLedgerRecord): TrackSource {
    let current = record
    const trackSource = source(current)
    trackSource.load = vi.fn(async () => current)
    trackSource.toggleKick = vi.fn(async (id: string) => {
      current = {
        ...current,
        puffSessions: current.puffSessions.map((session) =>
          session.id !== id
            ? session
            : session.kickMarkedAt === undefined
              ? marked(session)
              : unmarked(session),
        ),
      }
      return current
    })
    return trackSource
  }

  const clock = { now: () => new Date('2026-08-29T19:02:00.000Z'), timeZone: () => 'UTC' }

  /** One held press, through to the `click` the browser sends after it. */
  function heldPress(element: HTMLElement) {
    fireEvent.pointerDown(element, { clientX: 100, clientY: 100 })
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS))
    fireEvent.pointerUp(element)
    fireEvent.click(element, { detail: 1 })
  }

  it('marks with one held press and un-marks with the next, opening nothing', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const trackSource = markingSource({
      ...emptyRecord,
      puffSessions: [session('morning', '2026-08-29T10:00:00.000Z', 2)],
    })
    render(<TrackScreen source={trackSource} clock={clock} />)

    heldPress(await screen.findByRole('button', { name: 'Puff Session, 2 puffs at 10:00' }))

    // The everyday path: one held press, no dialog, no chrome. The halo and the
    // label are the whole of the answer.
    const kicked = await screen.findByRole('button', {
      name: 'Puff Session, 2 puffs at 10:00, Kicked',
    })
    expect(kicked).toHaveClass('kicked')
    expect(trackSource.toggleKick).toHaveBeenCalledWith('morning', clock.now())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // Taking a mark back is the same gesture that made it.
    heldPress(kicked)
    expect(
      await screen.findByRole('button', { name: 'Puff Session, 2 puffs at 10:00' }),
    ).not.toHaveClass('kicked')
    expect(trackSource.toggleKick).toHaveBeenCalledTimes(2)
  })

  it('carries the same toggle above the editor’s fields, applying before Save changes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const trackSource = markingSource({
      ...emptyRecord,
      puffSessions: [session('morning', '2026-08-29T10:00:00.000Z', 2)],
    })
    render(<TrackScreen source={trackSource} clock={clock} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Puff Session, 2 puffs at 10:00' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit Puff Session' })
    const toggle = within(dialog).getByRole('switch', { name: 'Kicked' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')

    // The editor is a Correction surface where nothing commits until `Save
    // changes`. The Kick is not, so the toggle sits **above** the fields rather
    // than among them — and says so.
    expect(toggle.compareDocumentPosition(within(dialog).getByLabelText('Time'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
    expect(dialog).toHaveTextContent('Applies straight away. You can also long-press the mark.')

    fireEvent.click(toggle)
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'))
    expect(trackSource.toggleKick).toHaveBeenCalledWith('morning', clock.now())

    // Nothing proposed, nothing named, no Momentum impact: a Kick moves no
    // derived figure, so none of the Correction machinery applies.
    expect(trackSource.correct).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog', { name: 'Momentum change' })).not.toBeInTheDocument()

    // It has already applied, so it survives closing the editor without saving.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close editor' }))
    expect(
      await screen.findByRole('button', { name: 'Puff Session, 2 puffs at 10:00, Kicked' }),
    ).toHaveClass('kicked')
    expect(trackSource.correct).not.toHaveBeenCalled()
  })

  it('is one toggle, so either route takes back what the other made', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const trackSource = markingSource({
      ...emptyRecord,
      puffSessions: [session('morning', '2026-08-29T10:00:00.000Z', 2)],
    })
    render(<TrackScreen source={trackSource} clock={clock} />)

    heldPress(await screen.findByRole('button', { name: 'Puff Session, 2 puffs at 10:00' }))
    const kicked = await screen.findByRole('button', {
      name: 'Puff Session, 2 puffs at 10:00, Kicked',
    })

    // Made by the fast path, taken back by the findable one. Two routes onto
    // one target with the same reach and the same semantics — not two
    // affordances that happen to write the same field.
    fireEvent.click(kicked)
    const toggle = within(screen.getByRole('dialog')).getByRole('switch', { name: 'Kicked' })
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(toggle)
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'))
    expect(screen.queryByLabelText(/Kicked/)).not.toBeInTheDocument()
  })

  it('reaches a sitting inside its open Merge Window without closing or extending it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const open = session('open', '2026-08-29T19:00:00.000Z', 2, '2026-08-29T19:01:00.000Z')
    const trackSource = markingSource({ ...emptyRecord, puffSessions: [open] })
    render(<TrackScreen source={trackSource} clock={clock} />)

    heldPress(await screen.findByRole('button', { name: 'Puff Session, 2 puffs at 19:00' }))

    // The open mark is a mark like any other. The window is keyed to taps, so
    // marking leaves `lastTapAt` alone and the sitting stays open and open only
    // for as long as it had left.
    const kicked = await screen.findByRole('button', {
      name: 'Puff Session, 2 puffs at 19:00, Kicked',
    })
    expect(kicked).toHaveClass('open-mark', 'kicked')
    expect(screen.getByText(/Open session/)).toBeInTheDocument()
    expect(trackSource.toggleKick).toHaveBeenCalledWith('open', clock.now())
    expect(trackSource.logPuff).not.toHaveBeenCalled()
  })

  it('hands the Yesterday lane no route to the act at all', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const trackSource = markingSource({
      ...emptyRecord,
      puffSessions: [
        yesterdaySession('delivered', '2026-08-28T10:00:00.000Z', 3),
        session('today', '2026-08-29T10:00:00.000Z', 2),
      ],
    })
    render(<TrackScreen source={trackSource} clock={clock} />)

    const yesterday = await screen.findByLabelText('Yesterday, Puff Session, 3 puffs at 10:00')
    heldPress(yesterday)
    fireEvent.click(yesterday)

    // Read-only **structurally**: the lane is handed ids and never a handler, so
    // there is no gesture to refuse and nothing to remember to guard. Reach is
    // today's marks, live lane only.
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS * 2))
    expect(trackSource.toggleKick).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(timelineElement('.yesterday-lane')).queryAllByRole('button')).toHaveLength(0)
  })

  it('grows no chrome for either route, and asks nothing after a sitting', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const trackSource = markingSource({
      ...emptyRecord,
      puffSessions: [session('open', '2026-08-29T19:00:00.000Z', 2, '2026-08-29T19:01:00.000Z')],
    })
    render(<TrackScreen source={trackSource} clock={clock} />)

    heldPress(await screen.findByRole('button', { name: 'Puff Session, 2 puffs at 19:00' }))
    await screen.findByRole('button', { name: 'Puff Session, 2 puffs at 19:00, Kicked' })

    // A third `Kick` button beside `PUFF` and `Resisted` was refused on the
    // chrome budget, and a readout lingering past the Merge Window asking
    // `Kicked?` more sharply still — it is the second decision on every log
    // that ADR 0010 exists to prevent. Both routes are silent until you go to
    // them, and marking is not one of them either.
    expect(
      within(timelineElement('.track-actions')).getAllByRole('button').map((one) => one.textContent),
    ).toEqual(['Resisted', '+1 → 3'])
    expect(screen.queryByRole('button', { name: /^Kick/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/Kicked\?/)).not.toBeInTheDocument()
  })

  it('offers the toggle on a Puff Session and on nothing else', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const trackSource = markingSource({
      ...emptyRecord,
      resistedUrges: [resistedUrge('2026-08-29T14:00:00.000Z')],
    })
    render(<TrackScreen source={trackSource} clock={clock} />)

    // A Kick is a fact about what a *sitting* delivered. A Resisted Urge is not
    // a sitting, and an event that has not happened yet has nothing to have
    // delivered.
    fireEvent.click(await screen.findByRole('button', { name: 'Resisted Urge at 14:00' }))
    expect(within(screen.getByRole('dialog')).queryByRole('switch')).not.toBeInTheDocument()

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close editor' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add past event' }))
    expect(within(screen.getByRole('dialog')).queryByRole('switch')).not.toBeInTheDocument()
  })

  it('is reachable and operable by keyboard and screen reader, which the press is not', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const trackSource = markingSource({
      ...emptyRecord,
      puffSessions: [session('morning', '2026-08-29T10:00:00.000Z', 2)],
    })
    render(<TrackScreen source={trackSource} clock={clock} />)

    // The toggle is the app's **only** keyboard- and screen-reader-reachable
    // route to the act. It is not optional polish, so it is a real focusable
    // control announcing its state rather than a styled div.
    fireEvent.click(await screen.findByRole('button', { name: 'Puff Session, 2 puffs at 10:00' }))
    const toggle = within(screen.getByRole('dialog')).getByRole('switch', { name: 'Kicked' })
    toggle.focus()
    expect(toggle).toHaveFocus()
    expect(toggle.tagName).toBe('BUTTON')

    // And the commit rule it does not share with the fields around it is said
    // aloud with it, rather than only drawn beneath it.
    expect(toggle).toHaveAccessibleDescription(
      'Applies straight away. You can also long-press the mark.',
    )
  })
})

describe('the Yesterday lane', () => {
  afterEach(() => vi.restoreAllMocks())

  /** The morning screen the lane exists for: 07:51, with today barely begun. */
  const morning = { now: () => new Date('2026-08-29T07:51:00.000Z'), timeZone: () => 'UTC' }

  it('draws yesterday whole, in its own lane, on the axis today is drawn on', async () => {
    render(
      <TrackScreen
        source={source({
          ...emptyRecord,
          puffSessions: [
            session('today', '2026-08-29T06:00:00.000Z', 2),
            yesterdaySession('yesterday morning', '2026-08-28T06:00:00.000Z', 7),
            yesterdaySession('yesterday night', '2026-08-28T22:00:00.000Z', 3),
          ],
          resistedUrges: [yesterdayUrge('yesterday urge', '2026-08-28T14:00:00.000Z')],
        })}
        clock={morning}
      />,
    )

    await screen.findByText('Yesterday')
    const [morningMark, nightMark] = timelineElements('.yesterday-mark')
    expect(timelineElements('.yesterday-mark')).toHaveLength(2)
    expect(timelineElements('.yesterday-ring')).toHaveLength(1)

    // Equal height is equal time of day on both days: the two 06:00 sessions
    // hang at the same height in different lanes, which is what makes the
    // comparison literal rather than shape-against-shape.
    expect(topPercent(morningMark!)).toBeCloseTo(topPercent(timelineElement('.puff-mark')))

    // Whole and full height, never truncated at `now` — 22:00 is drawn even
    // though today has only reached 07:51.
    expect(topPercent(nightMark!)).toBeCloseTo(75)
    expect(topPercent(timelineElement('.now-line'))).toBeCloseTo(16.042, 3)

    // The count is printed inside dim marks too; size is the at-a-glance
    // channel and the numeral is the exact value.
    expect(morningMark!.textContent).toBe('7')
    expect(morningMark!.style.width).toBe('36px')
    expect(timelineElement('.yesterday-ring').style.width).toBe('14px')

    // A Puff Session describes itself the same way in either lane, and the
    // lane's one dim word only reaches a reader who can see it — so the marks
    // say which day they are on where only assistive technology hears it.
    expect(screen.getByLabelText('Yesterday, Puff Session, 7 puffs at 06:00')).toBe(morningMark)
    expect(screen.getByLabelText('Yesterday, Resisted Urge at 14:00')).toHaveClass(
      'yesterday-ring',
    )
    expect(screen.getByLabelText('Puff Session, 2 puffs at 06:00')).toHaveClass('puff-mark')
  })

  it('carries one word of text — `Yesterday`, and never `Today`', async () => {
    render(
      <TrackScreen
        source={source({
          ...emptyRecord,
          puffSessions: [yesterdaySession('one', '2026-08-28T10:00:00.000Z', 1)],
        })}
        clock={morning}
      />,
    )

    const lane = await screen.findByText('Yesterday')
    expect(lane).toBeInTheDocument()
    // The live lane is the screen; labelling the default would imply a choice
    // of lanes where there is none.
    expect(screen.queryByText('Today')).not.toBeInTheDocument()
    expect(timelineElements('.yesterday-label')).toHaveLength(1)
  })

  it('puts the Clear token beneath the label, over an empty lane', async () => {
    render(
      <TrackScreen
        source={source({ ...emptyRecord, clearDays: [yesterdayClearDay()] })}
        clock={morning}
      />,
    )

    await screen.findByText('Yesterday')
    // Beneath the label rather than merged into `Yesterday: Clear`, which would
    // read as the value of a field. A Clear Day is a deliberate assertion, and
    // drawing it as an empty lane is the one thing this lane must not do.
    const head = timelineElement('.yesterday-head')
    expect(head.textContent).toBe('YesterdayClear')
    expect(timelineElements('.yesterday-mark')).toHaveLength(0)
    expect(timelineElements('.yesterday-ring')).toHaveLength(0)
  })

  it('keeps both the Clear token and the rings when yesterday was fought and won', async () => {
    // Reachable, and the four-state table does not describe it: only a Puff
    // Session drops a Clear Day, so resisting an urge and then declaring the
    // day Clear leaves both on the record. Drawn as both — the table's `empty`
    // describes the ordinary Clear Day, and suppressing the rings here is the
    // exact failure the lane draws them to avoid.
    render(
      <TrackScreen
        source={source({
          ...emptyRecord,
          clearDays: [yesterdayClearDay()],
          resistedUrges: [yesterdayUrge('fought', '2026-08-28T14:00:00.000Z')],
        })}
        clock={morning}
      />,
    )

    await screen.findByText('Yesterday')
    expect(screen.getByText('Clear')).toBeInTheDocument()
    expect(timelineElements('.yesterday-ring')).toHaveLength(1)
    expect(timelineElements('.yesterday-mark')).toHaveLength(0)
  })

  it('draws a day Known only by Resisted Urges as rings, not as a Clear Day', async () => {
    render(
      <TrackScreen
        source={source({
          ...emptyRecord,
          resistedUrges: [
            yesterdayUrge('one', '2026-08-28T14:00:00.000Z'),
            yesterdayUrge('two', '2026-08-28T18:00:00.000Z'),
          ],
        })}
        clock={morning}
      />,
    )

    await screen.findByText('Yesterday')
    // A day that was fought must not read as one that was quiet.
    expect(timelineElements('.yesterday-ring')).toHaveLength(2)
    expect(screen.queryByText('Clear')).not.toBeInTheDocument()
  })

  it('draws nothing at all when yesterday is Unknown within the history the app has', async () => {
    render(
      <TrackScreen
        source={source({
          ...emptyRecord,
          puffSessions: [sessionOn('2026-08-25', 'older', '2026-08-25T10:00:00.000Z', 4)],
        })}
        clock={morning}
      />,
    )

    // The strip offers the day in this same moment; the lane still asserts
    // nothing — no lane, no hatched rail, not the word `Unknown`.
    await screen.findByText('Anything you remember?')
    expect(timelineElements('.yesterday-lane')).toHaveLength(0)
    expect(screen.queryByText('Yesterday')).not.toBeInTheDocument()
  })

  it('draws nothing at all on day one, when yesterday is before any history', async () => {
    render(
      <TrackScreen
        source={source({
          ...emptyRecord,
          puffSessions: [session('first', '2026-08-29T06:00:00.000Z', 1)],
        })}
        clock={morning}
      />,
    )

    await screen.findByLabelText(/Puff Session, 1 puff /)
    expect(timelineElements('.yesterday-lane')).toHaveLength(0)
    expect(screen.queryByText('Anything you remember?')).not.toBeInTheDocument()
  })

  it('is always yesterday, never the most recent Known Logical Day', async () => {
    render(
      <TrackScreen
        source={source({
          ...emptyRecord,
          puffSessions: [sessionOn('2026-08-26', 'three back', '2026-08-26T10:00:00.000Z', 12)],
        })}
        clock={morning}
      />,
    )

    await screen.findByText('Anything you remember?')
    expect(timelineElements('.yesterday-lane')).toHaveLength(0)
  })

  it('holds no tap target, no Target hairline and nothing red', async () => {
    render(
      <TrackScreen
        source={source({
          ...emptyRecord,
          puffSessions: [
            yesterdaySession('over', '2026-08-28T10:00:00.000Z', 30),
            session('today over', '2026-08-29T06:00:00.000Z', 30),
          ],
          resistedUrges: [yesterdayUrge('urge', '2026-08-28T14:00:00.000Z')],
          ratchetSteps: [target(2)],
        })}
        clock={morning}
      />,
    )

    await screen.findByText('Yesterday')
    const lane = timelineElement('.yesterday-lane')
    // A tappable second lane roughly doubles the tap targets on the one screen
    // whose thesis is that logging costs under a second, and the wrong tap
    // there is a mis-log on today.
    expect(within(lane).queryAllByRole('button')).toHaveLength(0)
    expect(lane.querySelectorAll('button, a, input, [tabindex]')).toHaveLength(0)
    // Today's hairline stands, and it stands outside the lane. One axis never
    // carries two Targets.
    expect(timelineElements('.target-reached')).toHaveLength(1)
    expect(lane.querySelector('.target-reached')).toBeNull()
    expect(lane.querySelector('.over-target')).toBeNull()
  })

  it("draws yesterday's Kicks in the same treatment, adding nothing per-mark", async () => {
    render(
      <TrackScreen
        source={source({
          ...emptyRecord,
          puffSessions: [
            marked(yesterdaySession('delivered', '2026-08-28T10:00:00.000Z', 3)),
            yesterdaySession('quiet', '2026-08-28T22:00:00.000Z', 1),
          ],
        })}
        clock={morning}
      />,
    )

    await screen.findByText('Yesterday')
    const delivered = screen.getByLabelText('Yesterday, Puff Session, 3 puffs at 10:00, Kicked')

    // Withholding yesterday's Kicks would draw a day that delivered identically
    // to one that did nothing — the same honesty argument the dim rings are
    // drawn on. It gets the live lane's halo and **nothing beyond the lane's own
    // `0.42`**: no boosted accent, no per-mark exception (ADR 0014), which is
    // safe only because the separator is hue rather than luminance.
    expect(delivered.className).toBe('yesterday-mark kicked')
    expect(delivered.style.width).toBe('28px')
    expect(screen.getByLabelText('Yesterday, Puff Session, 1 puff at 22:00').className).toBe(
      'yesterday-mark',
    )

    // Drawing the Kick adds a fact to the picture and no gesture, which is
    // precisely what a read-only lane is for.
    expect(within(timelineElement('.yesterday-lane')).queryAllByRole('button')).toHaveLength(0)
  })

  it('keeps the unlived tone to the live lane, because all of yesterday happened', async () => {
    render(
      <TrackScreen
        source={source({
          ...emptyRecord,
          puffSessions: [yesterdaySession('one', '2026-08-28T22:00:00.000Z', 1)],
        })}
        clock={morning}
      />,
    )

    await screen.findByText('Yesterday')
    // The tone belongs to one lane and is drawn outside the other. Where it
    // *stops* is the stylesheet's to keep — `.timeline-unlived` starts on the
    // live spine exactly, since it paints over the Yesterday lane and any
    // overhang would tint the top of yesterday's fan gap below `now`.
    expect(timelineElement('.yesterday-lane').querySelector('.timeline-unlived')).toBeNull()
    expect(timelineElement('.timeline-unlived').parentElement).toHaveClass('timeline')
  })

  it('fans yesterday into the gap between the two spines', async () => {
    measureTimeline()
    render(
      <TrackScreen
        source={source({
          ...emptyRecord,
          puffSessions: [
            yesterdaySession('ten', '2026-08-28T07:34:00.000Z', 10),
            yesterdaySession('six', '2026-08-28T07:38:00.000Z', 6),
          ],
        })}
        clock={morning}
      />,
    )

    await screen.findByText('Yesterday')
    const [ten, six] = timelineElements('.yesterday-mark')

    // Four minutes apart is where they stay; the second colours into the next
    // column right, measured from its own lane's spine.
    expect(topPercent(six!) - topPercent(ten!)).toBeCloseTo(0.2778, 4)
    expect(ten!.style.left).toBe('')
    expect(six!.style.left).toBe('calc(var(--yesterday-spine) + 40px)')
    expect(timelineElement('.yesterday-spoke').style.width).toBe('40px')

    // Both spines arrive from the geometry module, because the stylesheet keeps
    // no copy of either number.
    const timeline = timelineElement('.timeline')
    expect(timeline.style.getPropertyValue('--yesterday-spine')).toBe('16%')
    expect(timeline.style.getPropertyValue('--spine')).toBe('46%')
  })
})
