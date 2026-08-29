import { describe, expect, it } from 'vitest'
import { isStandalone, type InstallEnvironment } from './install-state.ts'

function fakeEnvironment(options: { displayMode?: boolean; legacy?: boolean }) {
  const queries: string[] = []
  const environment: InstallEnvironment = {
    matchMedia: (query: string) => {
      queries.push(query)
      return { matches: options.displayMode ?? false }
    },
    navigator: { standalone: options.legacy },
  }
  return { environment, queries }
}

describe('isStandalone', () => {
  it('reports installed when the display mode is standalone', () => {
    const { environment } = fakeEnvironment({ displayMode: true })
    expect(isStandalone(environment)).toBe(true)
  })

  it('reports installed on the legacy iOS signal alone — either is sufficient', () => {
    const { environment } = fakeEnvironment({ displayMode: false, legacy: true })
    expect(isStandalone(environment)).toBe(true)
  })

  it('reports not installed when neither signal is present', () => {
    const { environment } = fakeEnvironment({})
    expect(isStandalone(environment)).toBe(false)
  })

  it('reports not installed when the legacy signal is explicitly false', () => {
    const { environment } = fakeEnvironment({ displayMode: false, legacy: false })
    expect(isStandalone(environment)).toBe(false)
  })

  it('asks the display-mode question the spec names', () => {
    const { environment, queries } = fakeEnvironment({})
    isStandalone(environment)
    expect(queries).toEqual(['(display-mode: standalone)'])
  })
})
