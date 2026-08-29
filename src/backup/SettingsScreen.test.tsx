import 'fake-indexeddb/auto'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { VapeOffDatabase } from '../store/database.ts'
import {
  createBrowserBackupSource,
  type BackupSource,
  type LoadedBackupRecord,
  type PreparedRestore,
} from './browser-backup-source.ts'
import { BackupFileError } from './backup-file.ts'
import { SettingsScreen } from './SettingsScreen.tsx'

const loadedRecord: LoadedBackupRecord = {
  installId: 'install-id',
  puffSessions: [],
  resistedUrges: [],
  clearDays: [],
  ratchetSteps: [],
  exports: [],
}

const preparedRestore: PreparedRestore = {
  installId: 'source-install',
  logicalDayCount: 1,
  record: {
    puffSessions: [],
    resistedUrges: [],
    clearDays: [{
      logicalDay: '2026-08-20',
      at: '2026-08-20T20:00:00.000Z',
      tz: 'UTC',
    }],
    ratchetSteps: [],
    exports: [],
  },
}

function source(): BackupSource {
  return {
    load: vi.fn().mockResolvedValue(loadedRecord),
    backUp: vi.fn().mockResolvedValue({
      handoff: 'shared',
      fileName: 'vape-off-2026-08-29.json',
    }),
    prepareRestore: vi.fn().mockResolvedValue(preparedRestore),
    restore: vi.fn().mockResolvedValue(undefined),
  }
}

describe('Settings Backup', () => {
  it('builds and starts sharing a 2.5 MB Backup inside the button click', async () => {
    const db = new VapeOffDatabase(`settings-large-backup-${crypto.randomUUID()}`)
    await db.open()
    try {
      await db.meta.add({ key: 'installId', value: 'install-id' })
      await db.puffSessions.bulkAdd(
        Array.from({ length: 14_600 }, (_, index) => ({
          id: `session-${String(index).padStart(5, '0')}`,
          at: '2026-08-28T12:00:00.000+02:00',
          lastTapAt: '2026-08-28T12:01:00.000+02:00',
          count: 3,
          logicalDay: '2026-08-28',
          tz: 'Europe/Stockholm',
        })),
      )
      const handOff = vi.fn(async (file: File) => {
        expect(file.size).toBeGreaterThanOrEqual(2_500_000)
        return 'shared' as const
      })
      const backupSource = createBrowserBackupSource(
        db,
        {
          now: () => new Date('2026-08-29T12:34:56.789Z'),
          timeZone: () => 'UTC',
          randomUUID: () => 'current-backup',
          appBuild: { sha: 'abc1234', builtAt: '2026-08-29T08:00:00.000Z' },
        },
        handOff,
      )
      render(<SettingsScreen source={backupSource} installed />)

      fireEvent.click(await screen.findByRole('button', { name: 'Back up now' }))

      expect(handOff).toHaveBeenCalledOnce()
      expect(await screen.findByText(/was handed to the share sheet/)).toBeInTheDocument()
    } finally {
      await db.delete()
    }
  })

  it('builds and hands off a Backup from one tap, then refreshes the record', async () => {
    const backupSource = source()
    render(<SettingsScreen source={backupSource} installed />)

    fireEvent.click(await screen.findByRole('button', { name: 'Back up now' }))

    await waitFor(() => expect(backupSource.backUp).toHaveBeenCalledWith(loadedRecord))
    expect(await screen.findByText('vape-off-2026-08-29.json was handed to the share sheet.')).toBeInTheDocument()
    expect(backupSource.load).toHaveBeenCalledTimes(2)
  })

  it('points at installation instead of offering Backup actions in a tab', async () => {
    const backupSource = source()
    render(<SettingsScreen source={backupSource} installed={false} />)

    expect(screen.queryByRole('button', { name: 'Back up now' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Restore from a backup')).not.toBeInTheDocument()
    expect(screen.getByText('Install vape-off to back up or restore your record.')).toBeInTheDocument()
    expect(backupSource.load).not.toHaveBeenCalled()
  })

  it('does not report a cancelled share as a completed Backup', async () => {
    const backupSource = source()
    vi.mocked(backupSource.backUp).mockRejectedValue(new DOMException('Cancelled', 'AbortError'))
    render(<SettingsScreen source={backupSource} installed />)

    fireEvent.click(await screen.findByRole('button', { name: 'Back up now' }))

    await waitFor(() => expect(backupSource.backUp).toHaveBeenCalledOnce())
    expect(screen.queryByText(/was handed|download started/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back up now' })).toBeEnabled()
  })

  it('names both Logical Day counts before replacing a non-empty record', async () => {
    const backupSource = source()
    vi.mocked(backupSource.load).mockResolvedValueOnce({
      ...loadedRecord,
      puffSessions: [{
        id: 'session',
        at: '2026-08-21T12:00:00.000Z',
        lastTapAt: '2026-08-21T12:00:00.000Z',
        count: 2,
        logicalDay: '2026-08-21',
        tz: 'UTC',
      }],
      clearDays: [{
        logicalDay: '2026-08-22',
        at: '2026-08-22T20:00:00.000Z',
        tz: 'UTC',
      }],
    })
    render(<SettingsScreen source={backupSource} installed />)
    const file = new File(['{}'], 'backup.json', { type: 'application/json' })

    fireEvent.change(await screen.findByLabelText('Restore from a backup'), {
      target: { files: [file] },
    })

    expect(await screen.findByText(
      'Replace 2 Logical Days with the 1 in this backup?',
    )).toBeInTheDocument()
    expect(backupSource.restore).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Replace record' }))

    await waitFor(() => expect(backupSource.restore).toHaveBeenCalledWith(preparedRestore))
    expect(await screen.findByText('Backup restored.')).toBeInTheDocument()
    expect(backupSource.load).toHaveBeenCalledTimes(2)
  })

  it('restores an empty record without training a replacement confirmation', async () => {
    const backupSource = source()
    render(<SettingsScreen source={backupSource} installed />)
    const file = new File(['{}'], 'backup.json', { type: 'application/json' })

    fireEvent.change(await screen.findByLabelText('Restore from a backup'), {
      target: { files: [file] },
    })

    await waitFor(() => expect(backupSource.restore).toHaveBeenCalledWith(preparedRestore))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('confirms before replacing history that has no Known Logical Days', async () => {
    const backupSource = source()
    vi.mocked(backupSource.load).mockResolvedValueOnce({
      ...loadedRecord,
      ratchetSteps: [{
        id: 'step',
        effectiveFrom: '2026-08-20',
        target: 10,
        kind: 'earned',
        at: '2026-08-20T04:00:00.000Z',
      }],
    })
    render(<SettingsScreen source={backupSource} installed />)

    fireEvent.change(await screen.findByLabelText('Restore from a backup'), {
      target: { files: [new File(['{}'], 'backup.json')] },
    })

    expect(await screen.findByText(
      'Replace 0 Logical Days with the 1 in this backup?',
    )).toBeInTheDocument()
    expect(backupSource.restore).not.toHaveBeenCalled()
  })

  it('persists first-run dismissal only after restore completes', async () => {
    const backupSource = source()
    const onRestoreCompleted = vi.fn().mockResolvedValue(undefined)
    render(
      <SettingsScreen
        source={backupSource}
        installed
        onRestoreCompleted={onRestoreCompleted}
      />,
    )

    fireEvent.change(await screen.findByLabelText('Restore from a backup'), {
      target: { files: [new File(['{}'], 'backup.json')] },
    })

    await waitFor(() => expect(onRestoreCompleted).toHaveBeenCalledOnce())
    expect(backupSource.restore).toHaveBeenCalledBefore(onRestoreCompleted)
  })

  it('shows why a Backup is refused without offering replacement', async () => {
    const backupSource = source()
    vi.mocked(backupSource.prepareRestore).mockRejectedValue(
      new BackupFileError('This backup was made by a newer version of vape-off.'),
    )
    render(<SettingsScreen source={backupSource} installed />)

    fireEvent.change(await screen.findByLabelText('Restore from a backup'), {
      target: { files: [new File(['{}'], 'backup.json')] },
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This backup was made by a newer version of vape-off.',
    )
    expect(backupSource.restore).not.toHaveBeenCalled()
  })
})
