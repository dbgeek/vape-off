import { formatBuildIdentity } from './shell/build-identity.ts'
import { isStandalone } from './shell/install-state.ts'
import { pathFor, ROUTES, useRoute, type Route } from './shell/routing.ts'
import { browserBackupSource, type BackupSource } from './backup/browser-backup-source.ts'
import { SettingsScreen } from './backup/SettingsScreen.tsx'
import { browserStatsSource } from './stats/browser-stats-source.ts'
import { StatsScreen, type StatsSource } from './stats/StatsScreen.tsx'
import { browserTrackSource } from './track/browser-track-source.ts'
import { TrackScreen, type TrackSource } from './track/TrackScreen.tsx'

/**
 * The empty shell. No data, no domain — S1 is the container the app lives in.
 *
 * Everything below is scaffolding that later slices replace: Track (S6–S7),
 * Stats (S8), and Settings with the build identity and the four exceptional
 * states (S11). What is load-bearing here is the layout — `viewport-fit=cover`
 * and the bottom safe-area inset — and the fact that the shell installs, opens
 * from the icon, and runs with no network.
 */

const TITLES: Record<Route, string> = {
  track: 'Track',
  stats: 'Stats',
  settings: 'Settings',
}

export function App({
  trackSource = browserTrackSource,
  statsSource = browserStatsSource,
  backupSource = browserBackupSource,
}: {
  trackSource?: TrackSource
  statsSource?: StatsSource
  backupSource?: BackupSource
}) {
  const [route, navigate] = useRoute()
  const installed = isStandalone()

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

      {route === 'track' ? <TrackScreen source={trackSource} backupSource={backupSource} /> : null}
      {route === 'stats' ? <StatsScreen source={statsSource} /> : null}
      {route === 'settings' ? (
        <SettingsScreen
          source={backupSource}
          installed={installed}
          onRestoreCompleted={trackSource.dismissFirstRunCard}
        />
      ) : null}

      {/*
        The build identity. Updates are silent, so this is the only way to tell
        what is running. It lives in Settings from S11; until Settings exists it
        sits here, above the home indicator.
      */}
      <footer
        className={`${route === 'track' ? 'hidden' : ''} px-5 pt-3 pb-safe-b text-center text-xs text-muted`}
      >
        <p className="pb-3">
          {formatBuildIdentity()} · {installed ? 'installed' : 'in a tab'}
        </p>
      </footer>
    </div>
  )
}
