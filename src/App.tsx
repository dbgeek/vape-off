import { useEffect, useState } from 'react'
import { formatBuildIdentity } from './shell/build-identity.ts'
import { isStandalone } from './shell/install-state.ts'
import { pathFor, ROUTES, useRoute, type Route } from './shell/routing.ts'
import {
  browserStartupSource,
  type ShellState,
  type StartupSource,
} from './shell/startup-state.ts'
import {
  browserBackupSource,
  type BackupSource,
  type PreparedRestore,
} from './backup/browser-backup-source.ts'
import { SettingsScreen } from './backup/SettingsScreen.tsx'
import { browserStatsSource } from './stats/browser-stats-source.ts'
import { StatsScreen, type StatsSource } from './stats/StatsScreen.tsx'
import { browserTrackSource } from './track/browser-track-source.ts'
import { TrackScreen, type TrackSource } from './track/TrackScreen.tsx'

/**
 * The shell: it opens the store, then decides which of the four exceptional
 * states stands between the reader and their record — still opening, failed
 * open, a database newer than this build, or the install wall — and otherwise
 * routes to Track, Stats or Settings.
 *
 * What is load-bearing in the layout is `viewport-fit=cover` and the bottom
 * safe-area inset, and the fact that the shell installs, opens from the icon,
 * and runs with no network.
 */

const TITLES: Record<Route, string> = {
  track: 'Track',
  stats: 'Stats',
  settings: 'Settings',
}

function InstallWall({ onContinue }: { onContinue: () => void }) {
  return (
    <main className="install-wall">
      <div className="install-wall-content">
        <span className="share-glyph" aria-hidden="true">
          <svg viewBox="0 0 32 32">
            <path d="M16 20V3m0 0-6 6m6-6 6 6M9 13H6v16h20V13h-3" />
          </svg>
        </span>
        <p className="exception-kicker">Before you begin</p>
        <h1>Install vape-off</h1>
        <p>In Safari, tap Share, then Add to Home Screen. Open vape-off from the new icon so your record is not kept in a temporary browser tab.</p>
        <button type="button" className="continue-anyway" onClick={onContinue}>Continue anyway</button>
      </div>
    </main>
  )
}

function FailedOpenScreen({
  backupSource,
  onRecovered,
  onRetry,
}: {
  backupSource: BackupSource
  onRecovered: () => void
  onRetry: () => void
}) {
  const [candidate, setCandidate] = useState<PreparedRestore>()
  const [recovering, setRecovering] = useState(false)
  const [recoveryError, setRecoveryError] = useState<string>()

  async function selectBackup(file: File) {
    setRecoveryError(undefined)
    try {
      setCandidate(await backupSource.prepareRestore(file))
    } catch {
      setRecoveryError('This is not a valid vape-off backup.')
    }
  }

  async function recover() {
    if (!candidate || recovering) return
    setRecovering(true)
    setRecoveryError(undefined)
    try {
      await backupSource.recover(candidate)
      onRecovered()
    } catch {
      setRecoveryError('The database could not be rebuilt from this Backup.')
    } finally {
      setRecovering(false)
    }
  }

  return (
    <main className="exception-screen">
      <div className="exception-content">
        <p className="exception-kicker">The database did not open</p>
        <h1>Your record could not be opened</h1>
        <p>Your data is likely still intact. You can try opening it again, or recover from a Backup.</p>
        <div className="exception-actions">
          <button type="button" onClick={onRetry}>Try again</button>
          <label className="recovery-picker">
            Restore from a backup
            <input
              type="file"
              accept="application/json,.json"
              disabled={recovering}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                event.currentTarget.value = ''
                if (file) void selectBackup(file)
              }}
            />
          </label>
        </div>
        {recoveryError ? <p role="alert">{recoveryError}</p> : null}
        <p className="build-identity">{formatBuildIdentity()}</p>
      </div>
      {candidate ? (
        <div className="restore-dialog" role="dialog" aria-modal="true" aria-labelledby="recovery-title">
          <h2 id="recovery-title">Replace unreadable database?</h2>
          <p>
            This will delete the unreadable database on this device and replace it with the{' '}
            {candidate.logicalDayCount} Logical Days in this Backup.
          </p>
          <div>
            <button type="button" disabled={recovering} onClick={() => setCandidate(undefined)}>
              Keep database
            </button>
            <button type="button" disabled={recovering} onClick={() => void recover()}>
              Delete database and restore
            </button>
          </div>
        </div>
      ) : null}
    </main>
  )
}

function OlderThanDataScreen() {
  return (
    <main className="exception-screen">
      <div className="exception-content">
        <p className="exception-kicker">Update required</p>
        <h1>This app is older than your data</h1>
        <p>Update vape-off, then open it again. Your record was written by a newer build and has not been changed.</p>
        <p className="build-identity">{formatBuildIdentity()}</p>
      </div>
    </main>
  )
}

export function App({
  trackSource = browserTrackSource,
  statsSource = browserStatsSource,
  backupSource = browserBackupSource,
  shellState: shellStateOverride,
  startupSource = browserStartupSource,
  installed: installedOverride,
}: {
  trackSource?: TrackSource
  statsSource?: StatsSource
  backupSource?: BackupSource
  shellState?: ShellState
  startupSource?: StartupSource
  installed?: boolean
}) {
  const [route, navigate] = useRoute()
  const installed = installedOverride ?? isStandalone()
  const [loadedShellState, setLoadedShellState] = useState<ShellState>()
  const [continuedAnyway, setContinuedAnyway] = useState(false)
  const shellState = shellStateOverride ?? loadedShellState

  function reloadShellState() {
    if (shellStateOverride) return
    setLoadedShellState(undefined)
    void startupSource.load().then(setLoadedShellState)
  }

  useEffect(() => {
    if (shellStateOverride) return
    let live = true
    startupSource.load().then((state) => {
      if (live) setLoadedShellState(state)
    })
    return () => {
      live = false
    }
  }, [shellStateOverride, startupSource])

  if (!shellState) {
    return <main className="startup-loading" aria-label="Opening vape-off" />
  }

  if (shellState.status === 'failed-open') {
    return (
      <FailedOpenScreen
        backupSource={backupSource}
        onRecovered={reloadShellState}
        onRetry={reloadShellState}
      />
    )
  }

  if (shellState.status === 'older-than-data') {
    return <OlderThanDataScreen />
  }

  if (
    shellState.status === 'ready'
    && !installed
    && !shellState.hasHistory
    && !continuedAnyway
  ) {
    return (
      <InstallWall onContinue={() => setContinuedAnyway(true)} />
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden pt-safe-t">
      <nav className="z-20 flex gap-4 px-5 pt-4 text-sm">
        {ROUTES.map((candidate) => (
          <a
            key={candidate}
            href={pathFor(candidate)}
            aria-current={candidate === route ? 'page' : undefined}
            className={
              candidate === route ? 'text-paper underline underline-offset-4' : 'text-muted'
            }
            onClick={(event) => {
              event.preventDefault()
              navigate(candidate)
            }}
          >
            {TITLES[candidate]}
          </a>
        ))}
      </nav>

      {route === 'track' ? (
        <TrackScreen
          source={trackSource}
          backupSource={backupSource}
          installed={installed}
          forceInstallBar={
            !installed
            && shellState.status === 'ready'
            && (!shellState.hasHistory || continuedAnyway)
          }
        />
      ) : null}
      {route === 'stats' ? <StatsScreen source={statsSource} installed={installed} /> : null}
      {route === 'settings' ? (
        <SettingsScreen
          source={backupSource}
          installed={installed}
          onRestoreCompleted={trackSource.dismissFirstRunCard}
        />
      ) : null}

    </div>
  )
}
