import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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

function source(record: DayLedgerRecord): TrackSource {
  return {
    load: vi.fn().mockResolvedValue(record),
    logPuff: vi.fn().mockResolvedValue(record),
    logResistedUrge: vi.fn().mockResolvedValue(record),
  }
}

describe('Track', () => {
  it('shows the Logical Day with now centred, its two event forms, and fixed one-tap actions', async () => {
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
    expect(screen.getByText('now').parentElement).toHaveStyle({ top: '50%' })
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

  it('drops Pace ghosts and shows only the count during the Baseline', async () => {
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
    expect(screen.queryByLabelText(/Pace slot at/)).not.toBeInTheDocument()
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

  it('places Target 0 at the opening boundary and colors every Puff Session after it', async () => {
    render(
      <TrackScreen
        source={source({
          ...emptyRecord,
          puffSessions: [session('first', '2026-08-29T10:00:00.000Z', 1)],
          ratchetSteps: [target(0)],
        })}
        clock={{ now: () => new Date('2026-08-29T12:00:00.000Z'), timeZone: () => 'UTC' }}
      />,
    )

    const fact = await screen.findByText('Target reached 04:00')
    expect(fact.parentElement).toHaveStyle({ top: '0%' })
    expect(screen.getByLabelText('Puff Session, 1 puff at 10:00')).toHaveClass('over-target')
    expect(screen.getByRole('button', { name: 'PUFF' })).toHaveClass('puff-button')
  })
})
