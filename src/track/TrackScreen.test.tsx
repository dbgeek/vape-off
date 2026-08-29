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

function source(record: DayLedgerRecord): TrackSource {
  return {
    load: vi.fn().mockResolvedValue(record),
    loadFirstRunCardDismissed: vi.fn().mockResolvedValue(true),
    logPuff: vi.fn().mockResolvedValue(record),
    logResistedUrge: vi.fn().mockResolvedValue(record),
    dismissFirstRunCard: vi.fn().mockResolvedValue(undefined),
    declareClearDay: vi.fn().mockResolvedValue(record),
    addPuffSession: vi.fn().mockResolvedValue(record),
    addResistedUrge: vi.fn().mockResolvedValue(record),
    updatePuffSession: vi.fn().mockResolvedValue(record),
    deletePuffSession: vi.fn().mockResolvedValue(record),
    updateResistedUrge: vi.fn().mockResolvedValue(record),
    deleteResistedUrge: vi.fn().mockResolvedValue(record),
    declareHandover: vi.fn().mockResolvedValue(record),
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

  it('colors every Puff Session at Target 0 without inventing a moment it was reached', async () => {
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

    expect(await screen.findByLabelText('Puff Session, 1 puff at 10:00')).toHaveClass('over-target')
    expect(screen.queryByText(/^Target reached/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'PUFF' })).toHaveClass('puff-button')
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

  it('offers only the seven most recent Unknown Logical Days without debt framing', async () => {
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

  it('does not turn the days before a new user first writes into catch-up work', async () => {
    render(
      <TrackScreen
        source={source({
          ...emptyRecord,
          puffSessions: [session('first', '2026-08-29T10:00:00.000Z', 1)],
        })}
        clock={{ now: () => new Date('2026-08-29T12:00:00.000Z'), timeZone: () => 'UTC' }}
      />,
    )

    await screen.findByLabelText('Puff Session, 1 puff at 10:00')
    expect(screen.queryByRole('region', { name: 'Catch up' })).not.toBeInTheDocument()
  })

  it('offers catch-up when stored Ratchet decisions outlive hard-deleted events', async () => {
    const ratchetOnlyTarget = { ...target(4), effectiveFrom: '2026-08-26' }
    render(
      <TrackScreen
        source={source({ ...emptyRecord, ratchetSteps: [ratchetOnlyTarget] })}
        clock={{ now: () => new Date('2026-08-29T12:00:00.000Z'), timeZone: () => 'UTC' }}
      />,
    )

    expect(within(await screen.findByRole('region', { name: 'Catch up' })).getAllByRole('article')).toHaveLength(3)
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
      expect(trackSource.updatePuffSession).toHaveBeenCalledWith(
        'morning',
        expect.objectContaining({ count: 3 }),
      ),
    )
    expect(screen.queryByText(/Are you sure/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Puff Session, 2 puffs at 10:00' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(trackSource.deletePuffSession).toHaveBeenCalledWith('morning'))
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
    expect(trackSource.addPuffSession).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Apply change' }))
    await waitFor(() =>
      expect(trackSource.addPuffSession).toHaveBeenCalledWith({
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
    expect(trackSource.addPuffSession).not.toHaveBeenCalled()

    fireEvent.change(within(dialog).getByLabelText('Puff count'), { target: { value: '1' } })
    fireEvent.change(within(dialog).getByLabelText('Time'), {
      target: { value: '2026-08-30T12:00' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    expect(within(dialog).getByText('Choose a time that has already happened.')).toBeInTheDocument()
    expect(trackSource.addPuffSession).not.toHaveBeenCalled()
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
})
