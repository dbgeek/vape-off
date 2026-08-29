import { describe, expect, it } from 'vitest'
import { pathFor, routeFor, type Route } from './routing.ts'

describe('routeFor', () => {
  it('maps the three paths the app has', () => {
    expect(routeFor('/')).toBe('track')
    expect(routeFor('/stats')).toBe('stats')
    expect(routeFor('/settings')).toBe('settings')
  })

  it('ignores a trailing slash', () => {
    expect(routeFor('/stats/')).toBe('stats')
    expect(routeFor('/settings/')).toBe('settings')
  })

  it('falls back to Track for anything else — there are no deep links', () => {
    expect(routeFor('/nope')).toBe('track')
    expect(routeFor('')).toBe('track')
    expect(routeFor('/stats/2026-08-29')).toBe('track')
  })
})

describe('pathFor', () => {
  it('round-trips every route', () => {
    const routes: Route[] = ['track', 'stats', 'settings']
    for (const route of routes) expect(routeFor(pathFor(route))).toBe(route)
  })

  it('puts Track at the root, which is the manifest start_url', () => {
    expect(pathFor('track')).toBe('/')
  })
})
