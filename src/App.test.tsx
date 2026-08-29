import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from './App.tsx'
import { buildIdentity, formatBuildIdentity } from './shell/build-identity.ts'

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

  it('renders the route the URL names, so a reload after the catch-up lands where it was', () => {
    window.history.replaceState(null, '', '/stats')
    render(<App />)
    expect(screen.getByRole('heading')).toHaveTextContent('Stats')
  })

  it('reports the install state from the display-mode signal', () => {
    render(<App />)
    // jsdom's matchMedia reports no match and there is no navigator.standalone.
    expect(screen.getByText(/in a tab/)).toBeInTheDocument()
  })
})
