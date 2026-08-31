import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { BackupSource, PreparedRestore } from '../backup/browser-backup-source.ts'
import type { DayLedgerRecord } from '../domain/day-ledger.ts'
import type { PuffSession, RatchetStep, ResistedUrge } from '../store/records.ts'
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

function resistedUrge(at: string): ResistedUrge {
  return { id: 'resisted', at, logicalDay: '2026-08-29', tz: 'UTC' }
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

function source(record: DayLedgerRecord): TrackSource {
  return {
    load: vi.fn().mockResolvedValue(record),
    loadFirstRunCardDismissed: vi.fn().mockResolvedValue(true),
    logPuff: vi.fn().mockResolvedValue(record),
    logResistedUrge: vi.fn().mockResolvedValue(record),
    dismissFirstRunCard: vi.fn().mockResolvedValue(undefined),
    declareClearDay: vi.fn().mockResolvedValue(record),
    correct: vi.fn().mockResolvedValue({ status: 'corrected', record }),
    declareHandover: vi.fn().mockResolvedValue(record),
  }
}

describe('Track', () => {
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
    expect(strip).toHaveTextContent('Anything you remember?')
    expect(strip).toHaveTextContent('It is fine to leave a day unknown.')
    expect(strip).not.toHaveTextContent(/missed|owe|overdue/i)

    fireEvent.click(within(strip).getAllByRole('button', { name: /Clear Day/i })[0]!)
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
