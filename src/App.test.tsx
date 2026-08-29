import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App.tsx'
import { buildIdentity, formatBuildIdentity } from './shell/build-identity.ts'
import type { StatsSource } from './stats/StatsScreen.tsx'

beforeEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('the shell', () => {
  it('shows the build identity, because updates are silent', () => {
    render(<App />)
    expect(screen.getByText(new RegExp(formatBuildIdentity(buildIdentity)))).toBeInTheDocument()
  })

  it('opens on Track, which is the manifest start_url', () => {
    render(<App />)
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
    render(<App statsSource={statsSource} />)
    expect(await screen.findByRole('heading')).toHaveTextContent('Baseline')
  })

  it('reports the install state from the display-mode signal', () => {
    render(<App />)
    // jsdom's matchMedia reports no match and there is no navigator.standalone.
    expect(screen.getByText(/in a tab/)).toBeInTheDocument()
  })
})
