import { describe, expect, it } from 'vitest'
import { buildIdentity, formatBuildIdentity } from './build-identity.ts'

describe('formatBuildIdentity', () => {
  it('reads as a short SHA and the moment the build was cut', () => {
    expect(formatBuildIdentity({ sha: 'a1b2c3d', builtAt: '2026-08-29T10:33:07.000Z' })).toBe(
      'a1b2c3d · 2026-08-29 10:33 UTC',
    )
  })

  it('shows the timestamp alone when the SHA could not be read', () => {
    expect(formatBuildIdentity({ sha: 'unknown', builtAt: '2026-08-29T10:33:07.000Z' })).toBe(
      'unknown · 2026-08-29 10:33 UTC',
    )
  })

  it('does not throw on a timestamp it cannot parse', () => {
    expect(formatBuildIdentity({ sha: 'a1b2c3d', builtAt: 'not-a-time' })).toBe('a1b2c3d · unknown')
  })
})

describe('buildIdentity', () => {
  it('is injected at build time rather than read at runtime', () => {
    expect(buildIdentity.sha).not.toBe('')
    expect(buildIdentity.builtAt).not.toBe('')
  })
})
