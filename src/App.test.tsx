import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App.tsx'
import { buildIdentity, formatBuildIdentity } from './shell/build-identity.ts'
import type { StatsSource } from './stats/StatsScreen.tsx'
import type { TrackSource } from './track/TrackScreen.tsx'
import type { BackupSource, PreparedRestore } from './backup/browser-backup-source.ts'

beforeEach(() => {
  window.history.replaceState(null, '', '/')
})

function emptyTrackSource(): TrackSource {
  const record = { puffSessions: [], resistedUrges: [], clearDays: [], ratchetSteps: [] }
  return {
    load: vi.fn().mockResolvedValue(record),
    loadFirstRunCardDismissed: vi.fn().mockResolvedValue(false),
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

function recoveryBackupSource(candidate: PreparedRestore): BackupSource {
  return {
    load: vi.fn(),
    backUp: vi.fn(),
    prepareRestore: vi.fn().mockResolvedValue(candidate),
    restore: vi.fn(),
    recover: vi.fn().mockResolvedValue(undefined),
  }
}

describe('the shell', () => {
  it('walls an uninstalled empty store before logging or restore is reachable', () => {
    render(<App shellState={{ status: 'ready', hasHistory: false, installWallBypassed: false }} />)

    expect(screen.getByRole('heading', { name: 'Install vape-off' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue anyway' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'PUFF' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Restore from a backup/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/first week just measures/i)).not.toBeInTheDocument()
  })

  it('continues into logging under the permanent install bar, without enabling restore', () => {
    render(
      <App
        shellState={{ status: 'ready', hasHistory: false, installWallBypassed: false }}
        trackSource={emptyTrackSource()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Continue anyway' }))

    expect(screen.getByRole('button', { name: 'PUFF' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Install vape-off' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Choose a backup file')).not.toBeInTheDocument()
  })

  it('keeps a failed database open distinct from first run and offers safe recovery', () => {
    render(<App shellState={{ status: 'failed-open', error: new Error('unavailable') }} />)

    expect(screen.getByRole('heading', { name: 'Your record could not be opened' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.getByText('Restore from a backup')).toBeInTheDocument()
    expect(screen.getByText(new RegExp(formatBuildIdentity(buildIdentity)))).toBeInTheDocument()
    expect(screen.queryByText(/Start fresh/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/first week just measures/i)).not.toBeInTheDocument()
  })

  it('validates recovery first and names the destructive wipe on a second screen', async () => {
    const candidate: PreparedRestore = {
      installId: 'backup-install',
      logicalDayCount: 12,
      record: { puffSessions: [], resistedUrges: [], clearDays: [], ratchetSteps: [], exports: [] },
    }
    const backupSource = recoveryBackupSource(candidate)
    render(
      <App
        shellState={{ status: 'failed-open', error: new Error('unavailable') }}
        backupSource={backupSource}
      />,
    )

    fireEvent.change(screen.getByLabelText('Restore from a backup'), {
      target: { files: [new File(['{}'], 'backup.json')] },
    })

    const dialog = await screen.findByRole('dialog', { name: 'Replace unreadable database?' })
    expect(dialog).toHaveTextContent('delete the unreadable database on this device')
    expect(dialog).toHaveTextContent('12 Logical Days')
    expect(backupSource.recover).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Delete database and restore' }))
    expect(backupSource.recover).toHaveBeenCalledWith(candidate)
  })

  it('tries the database again on request and resumes the app after it opens', async () => {
    const startupSource = {
      load: vi.fn()
        .mockResolvedValueOnce({ status: 'failed-open', error: new Error('transient') })
        .mockResolvedValueOnce({ status: 'ready', hasHistory: true, installWallBypassed: false }),
      continueAnyway: vi.fn().mockResolvedValue(undefined),
    }
    render(<App startupSource={startupSource} trackSource={emptyTrackSource()} installed />)

    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('heading', { name: 'Track' })).toBeInTheDocument()
    expect(startupSource.load).toHaveBeenCalledTimes(2)
  })

  it('stops old code without offering retry, restore, or export', () => {
    render(<App shellState={{ status: 'older-than-data', databaseVersion: 2, schemaVersion: 1 }} />)

    expect(screen.getByRole('heading', { name: 'This app is older than your data' })).toBeInTheDocument()
    expect(screen.getByText(/update vape-off/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Restore from a backup/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Back up now/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/first week just measures/i)).not.toBeInTheDocument()
  })

  it('keeps logging reachable under the permanent bar when history exists in a tab', async () => {
    const trackSource = emptyTrackSource()
    vi.mocked(trackSource.load).mockResolvedValue({
      puffSessions: [{
        id: 'session',
        at: '2026-08-29T12:00:00.000Z',
        lastTapAt: '2026-08-29T12:00:00.000Z',
        count: 2,
        logicalDay: '2026-08-29',
        tz: 'UTC',
      }],
      resistedUrges: [],
      clearDays: [],
      ratchetSteps: [],
    })
    render(
      <App
        shellState={{ status: 'ready', hasHistory: true, installWallBypassed: false }}
        trackSource={trackSource}
        installed={false}
      />,
    )

    expect(await screen.findByRole('complementary', { name: 'Install vape-off' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'PUFF' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Install vape-off' })).not.toBeInTheDocument()
  })

  it('keeps the build identity in Settings, because updates are silent', () => {
    window.history.replaceState(null, '', '/settings')
    render(<App shellState={{ status: 'ready', hasHistory: true, installWallBypassed: false }} />)
    expect(screen.getByText(new RegExp(formatBuildIdentity(buildIdentity)))).toBeInTheDocument()
  })

  it('opens on Track, which is the manifest start_url', () => {
    render(<App shellState={{ status: 'ready', hasHistory: true, installWallBypassed: false }} />)
    expect(screen.getByRole('heading')).toHaveTextContent('Track')
  })

  it('renders the route the URL names, so a reload after the catch-up lands where it was', async () => {
    window.history.replaceState(null, '', '/stats')
    const statsSource: StatsSource = {
      load: vi.fn().mockResolvedValue({
        record: { puffSessions: [], resistedUrges: [], clearDays: [], ratchetSteps: [] },
        exports: [],
        backupCardDismissedAt: 0,
      }),
      dismissBackupCard: vi.fn().mockResolvedValue(undefined),
      declareStepBack: vi.fn(),
    }
    render(<App statsSource={statsSource} shellState={{ status: 'ready', hasHistory: true, installWallBypassed: false }} />)
    expect(await screen.findByRole('heading')).toHaveTextContent('Baseline')
  })

  it('reports the install state from the display-mode signal', () => {
    window.history.replaceState(null, '', '/settings')
    render(<App shellState={{ status: 'ready', hasHistory: true, installWallBypassed: false }} />)
    // jsdom's matchMedia reports no match and there is no navigator.standalone.
    expect(screen.getByText('Install vape-off to back up or restore your record.')).toBeInTheDocument()
  })
})
