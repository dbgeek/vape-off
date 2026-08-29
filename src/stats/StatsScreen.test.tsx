import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DayLedgerRecord } from '../domain/day-ledger.ts'
import type { ExportRecord, PuffSession, RatchetStep } from '../store/records.ts'
import { StatsScreen, type StatsSnapshot, type StatsSource } from './StatsScreen.tsx'

const emptyRecord: DayLedgerRecord = {
  puffSessions: [],
  resistedUrges: [],
  clearDays: [],
  ratchetSteps: [],
}

function session(id: string, logicalDay: string, hour: number, count: number): PuffSession {
  const at = `${logicalDay}T${String(hour).padStart(2, '0')}:00:00.000Z`
  return { id, logicalDay, at, lastTapAt: at, count, tz: 'UTC' }
}

function step(effectiveFrom: string, target: number): RatchetStep {
  return {
    id: `step-${effectiveFrom}`,
    effectiveFrom,
    target,
    kind: 'earned',
    at: `${effectiveFrom}T04:00:00.000Z`,
  }
}

function source(snapshot: StatsSnapshot): StatsSource {
  return {
    load: vi.fn().mockResolvedValue(snapshot),
    dismissBackupCard: vi.fn().mockResolvedValue(undefined),
    declareStepBack: vi.fn().mockResolvedValue(snapshot),
  }
}

const clock = { now: () => new Date('2026-08-29T18:00:00.000Z'), timeZone: () => 'UTC' }

describe('Stats', () => {
  it('is an honest Baseline screen with the Dial and no programme tiles', async () => {
    const statsSource = source({
      record: {
        ...emptyRecord,
        puffSessions: [session('evening', '2026-08-27', 21, 6)],
        clearDays: [{ logicalDay: '2026-08-28', at: '2026-08-28T12:00:00.000Z', tz: 'UTC' }],
      },
      exports: [],
      backupCardDismissedAt: 0,
    })

    render(<StatsScreen source={statsSource} clock={clock} installed />)

    expect(await screen.findByRole('heading', { name: 'Baseline' })).toBeInTheDocument()
    expect(screen.getByText('2 of 7 Known Logical Days')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /24-hour Dial, 04:00 at the top/i })).toBeInTheDocument()
    expect(screen.getByText('Your largest hour is 21:00.')).toBeInTheDocument()
    expect(screen.queryByText('Steps Remaining')).not.toBeInTheDocument()
    expect(screen.queryByText('Quit Horizon')).not.toBeInTheDocument()
  })

  it('shows Backup exposure from the first Baseline day only when installed', async () => {
    const statsSource = source({
      record: {
        ...emptyRecord,
        clearDays: [{ logicalDay: '2026-08-28', at: '2026-08-28T12:00:00.000Z', tz: 'UTC' }],
      },
      exports: [],
      backupCardDismissedAt: 0,
    })
    const { unmount } = render(<StatsScreen source={statsSource} clock={clock} installed />)

    expect(await screen.findByText('Last backup: 1 Logical Day ago.')).toBeInTheDocument()
    unmount()

    render(<StatsScreen source={statsSource} clock={clock} installed={false} />)
    await screen.findByRole('heading', { name: 'Baseline' })
    expect(screen.queryByText(/Last backup:/)).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Backup status' })).not.toBeInTheDocument()
  })

  it('keeps exact steps and the uncertain horizon in separate tiles with independent silence', async () => {
    render(
      <StatsScreen
        source={source({
          record: {
            ...emptyRecord,
            clearDays: [{ logicalDay: '2026-08-28', at: '2026-08-28T12:00:00.000Z', tz: 'UTC' }],
            ratchetSteps: [step('2026-08-20', 5)],
          },
          exports: [],
          backupCardDismissedAt: 0,
        })}
        clock={clock}
        installed
      />,
    )

    expect(await screen.findByRole('heading', { name: 'Stats' })).toBeInTheDocument()
    expect(within(screen.getByLabelText('Steps Remaining')).getByText('5')).toBeInTheDocument()
    expect(within(screen.getByLabelText('Quit Horizon')).getByText('—')).toBeInTheDocument()
  })

  it('draws separate trend segments across Unknown days and states why Longest Gap is a floor', async () => {
    render(
      <StatsScreen
        source={source({
          record: {
            ...emptyRecord,
            puffSessions: [
              session('first', '2026-08-25', 12, 3),
              session('second', '2026-08-27', 12, 4),
            ],
            clearDays: [{ logicalDay: '2026-08-29', at: '2026-08-29T12:00:00.000Z', tz: 'UTC' }],
            ratchetSteps: [step('2026-08-20', 8)],
          },
          exports: [],
          backupCardDismissedAt: 0,
        })}
        clock={clock}
        installed
      />,
    )

    const trend = await screen.findByRole('img', { name: '28-day puff and Target trend' })
    expect(trend.querySelectorAll('.trend-target-segment')).toHaveLength(3)
    expect(trend.querySelectorAll('.trend-total-segment')).toHaveLength(3)
    expect(screen.getByText('Unknown Logical Days excluded longer gaps.')).toBeInTheDocument()
    expect(screen.queryByText(/try|should|need to/i)).not.toBeInTheDocument()
  })

  it('plots Puff totals and Target on the same trend scale', async () => {
    render(
      <StatsScreen
        source={source({
          record: {
            ...emptyRecord,
            puffSessions: [session('half', '2026-08-29', 12, 4)],
            ratchetSteps: [step('2026-08-20', 8)],
          },
          exports: [],
          backupCardDismissedAt: 0,
        })}
        clock={clock}
        installed
      />,
    )

    const trend = await screen.findByRole('img', { name: '28-day puff and Target trend' })
    expect(trend.querySelector('.trend-total-segment')?.getAttribute('points')).toBe('276,44')
    expect(trend.querySelector('.trend-target-segment')?.getAttribute('points')).toBe('276,12')
  })

  it('draws Target changes as steps rather than diagonal interpolation', async () => {
    render(
      <StatsScreen
        source={source({
          record: {
            ...emptyRecord,
            clearDays: [
              { logicalDay: '2026-08-28', at: '2026-08-28T12:00:00.000Z', tz: 'UTC' },
              { logicalDay: '2026-08-29', at: '2026-08-29T12:00:00.000Z', tz: 'UTC' },
            ],
            ratchetSteps: [step('2026-08-20', 8), step('2026-08-29', 6)],
          },
          exports: [],
          backupCardDismissedAt: 0,
        })}
        clock={clock}
        installed
      />,
    )

    const targetLine = (await screen.findByRole('img', { name: '28-day puff and Target trend' }))
      .querySelector('.trend-target-segment')
    expect(targetLine?.getAttribute('points')).toBe('265.9259259259259,12 276,12 276,28')
  })

  it('shows backup exposure from the first Known Logical Day and repeats the card at 30', async () => {
    const clearDays = Array.from({ length: 31 }, (_, index) => {
      const day = String(index + 1).padStart(2, '0')
      return { logicalDay: `2026-07-${day}`, at: `2026-07-${day}T12:00:00.000Z`, tz: 'UTC' }
    })
    const statsSource = source({
      record: { ...emptyRecord, clearDays, ratchetSteps: [step('2026-07-01', 5)] },
      exports: [],
      backupCardDismissedAt: 0,
    })

    render(<StatsScreen source={statsSource} clock={clock} installed />)

    expect(await screen.findByText('Last backup: 31 Logical Days ago.')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Backup status' })).toHaveTextContent('31 Known Logical Days')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss backup card' }))
    await waitFor(() => expect(statsSource.dismissBackupCard).toHaveBeenCalledWith(31))
    expect(screen.queryByRole('region', { name: 'Backup status' })).not.toBeInTheDocument()
  })

  it('keeps backup status silent until the first uncovered Known Logical Day', async () => {
    render(
      <StatsScreen
        source={source({
          record: {
            ...emptyRecord,
            clearDays: [{ logicalDay: '2026-08-29', at: '2026-08-29T12:00:00.000Z', tz: 'UTC' }],
            ratchetSteps: [step('2026-08-20', 5)],
          },
          exports: [{ id: 'backup', logicalDay: '2026-08-29', at: '2026-08-29T13:00:00.000Z' }],
          backupCardDismissedAt: 0,
        })}
        clock={clock}
        installed
      />,
    )

    await screen.findByRole('heading', { name: 'Stats' })
    expect(screen.queryByText(/Last backup:/)).not.toBeInTheDocument()
  })

  it('makes Longest Gap the Target 0 headline and puts step-back behind a deliberate trip', async () => {
    const record = {
      ...emptyRecord,
      puffSessions: [session('last', '2026-08-27', 12, 1)],
      clearDays: [
        { logicalDay: '2026-08-28', at: '2026-08-28T12:00:00.000Z', tz: 'UTC' },
        { logicalDay: '2026-08-29', at: '2026-08-29T12:00:00.000Z', tz: 'UTC' },
      ],
      ratchetSteps: [step('2026-08-20', 0)],
    }
    const next = { record: { ...record, ratchetSteps: [...record.ratchetSteps, step('2026-08-29', 1)] }, exports: [] as ExportRecord[], backupCardDismissedAt: 0 }
    const statsSource = source({ record, exports: [], backupCardDismissedAt: 0 })
    vi.mocked(statsSource.declareStepBack).mockResolvedValue(next)

    render(<StatsScreen source={statsSource} clock={clock} installed />)

    const headline = await screen.findByRole('region', { name: 'Longest Gap' })
    expect(headline).toHaveClass('stats-headline')
    expect(screen.getByText('Momentum')).toBeInTheDocument()
    expect(screen.queryByText('Steps Remaining')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Set Target to 1' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Programme details' }))
    fireEvent.click(screen.getByRole('button', { name: 'Step back to Target 1' }))
    const dialog = screen.getByRole('dialog', { name: 'Step back to Target 1' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Set Target to 1' }))
    await waitFor(() => expect(statsSource.declareStepBack).toHaveBeenCalledOnce())
  })

  it('withholds same-day step-back and reports a rejected confirmation', async () => {
    const sameDaySource = source({
      record: { ...emptyRecord, ratchetSteps: [step('2026-08-29', 0)] },
      exports: [],
      backupCardDismissedAt: 0,
    })
    const { unmount } = render(<StatsScreen source={sameDaySource} clock={clock} installed />)
    await screen.findByRole('heading', { name: 'Stats' })
    expect(screen.queryByRole('button', { name: 'Programme details' })).not.toBeInTheDocument()
    unmount()

    const availableSource = source({
      record: { ...emptyRecord, ratchetSteps: [step('2026-08-20', 0)] },
      exports: [],
      backupCardDismissedAt: 0,
    })
    vi.mocked(availableSource.declareStepBack).mockRejectedValue(
      new Error('You have already changed your target today'),
    )
    render(<StatsScreen source={availableSource} clock={clock} installed />)
    fireEvent.click(await screen.findByRole('button', { name: 'Programme details' }))
    fireEvent.click(screen.getByRole('button', { name: 'Step back to Target 1' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Set Target to 1' }))
    expect(await screen.findByText('You have already changed your target today')).toBeInTheDocument()
  })

  it('refreshes programme readings when the app returns to view', async () => {
    const statsSource = source({
      record: { ...emptyRecord, ratchetSteps: [step('2026-08-20', 5)] },
      exports: [],
      backupCardDismissedAt: 0,
    })
    render(<StatsScreen source={statsSource} clock={clock} installed />)
    await screen.findByRole('heading', { name: 'Stats' })

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))

    await waitFor(() => expect(statsSource.load).toHaveBeenCalledTimes(2))
  })
})
