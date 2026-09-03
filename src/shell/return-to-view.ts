import { useEffect, useRef } from 'react'

/**
 * Runs a callback whenever the app comes back into view.
 *
 * A phone parks an app in the switcher rather than closing it, so a screen that
 * reads its record once at mount can sit for days showing a stale Target, a
 * stale Pace and a stale badge. Coming back into view is the only signal the
 * device gives that the reader has returned, and both screens need it.
 *
 * **The listener attaches once and never re-attaches.** The callback is held in
 * a ref rather than named as a dependency: a caller passing an inline arrow —
 * which both of them do — would otherwise detach and reattach on every render,
 * and a listener that is briefly absent is one that can miss the event it
 * exists for.
 *
 * It carries no timer. Track advances its own clock as well as reloading, and
 * Stats reads the time it needs on every render; a shared module holding a
 * timer one of its two callers did not want would be an option flag standing in
 * for a fact about one screen.
 */
export function useReturnToView(onReturn: () => void): void {
  const latest = useRef(onReturn)
  latest.current = onReturn

  useEffect(() => {
    function whenVisible() {
      // `visibilitychange` also fires on the way *out*. Only the return is news.
      if (document.visibilityState !== 'visible') return
      latest.current()
    }

    document.addEventListener('visibilitychange', whenVisible)
    return () => document.removeEventListener('visibilitychange', whenVisible)
  }, [])
}
