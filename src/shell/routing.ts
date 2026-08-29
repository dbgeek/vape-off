import { useEffect, useState } from 'react'

/**
 * History routing: `/` Track, `/stats` Stats, `/settings` Settings.
 *
 * Not for deep links — there are none — but for the iOS edge-swipe back
 * gesture, which a standalone web app honours even with no chrome and which
 * does nothing at all if there is only one URL. It needs the Vercel SPA
 * rewrite, because the 30-minute catch-up reloads the page and a reload
 * landing on `/stats` is a request the server really serves.
 */

export type Route = 'track' | 'stats' | 'settings'

/** The one place a route and its path are paired. */
const PATHS: Record<Route, string> = {
  track: '/',
  stats: '/stats',
  settings: '/settings',
}

/** In the order they are offered. Track first: it is the manifest's start_url. */
export const ROUTES = Object.keys(PATHS) as Route[]

const BY_PATH: ReadonlyMap<string, Route> = new Map(
  ROUTES.map((route) => [PATHS[route], route]),
)

export function pathFor(route: Route): string {
  return PATHS[route]
}

export function routeFor(pathname: string): Route {
  const normalised = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return BY_PATH.get(normalised) ?? 'track'
}

/** The current route, and a push that leaves an entry for the back gesture. */
export function useRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState<Route>(() => routeFor(window.location.pathname))

  useEffect(() => {
    const onPopState = () => setRoute(routeFor(window.location.pathname))
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = (next: Route) => {
    if (next === route) return
    window.history.pushState(null, '', pathFor(next))
    setRoute(next)
  }

  return [route, navigate]
}
