/**
 * The service worker has exactly two jobs: serve offline, and control updates.
 * This module is the second one.
 *
 * **Updates are silent and never mid-session.** A new version installs in the
 * background and takes over on the next cold start — which is what a worker
 * left in `waiting` does on its own, so nothing here has to arrange it.
 *
 * **Plus a bounded catch-up.** An iOS web app can sit in the app switcher for
 * days and never cold-start, so a return to visible after more than 30 minutes
 * hidden takes over a waiting worker immediately. A plain reload does not let a
 * waiting worker activate — the client is never unloaded — so the catch-up
 * necessarily calls `skipWaiting()`, made safe by reloading on
 * `controllerchange`.
 */

export const HIDDEN_CATCH_UP_MS = 30 * 60 * 1000

/** The message workbox's generated worker listens for when `skipWaiting` is false. */
export const SKIP_WAITING_MESSAGE = { type: 'SKIP_WAITING' } as const

export const SERVICE_WORKER_URL = '/sw.js'

interface WaitingWorkerLike {
  postMessage: (message: unknown) => void
}

export interface ServiceWorkerRegistrationLike {
  readonly waiting: WaitingWorkerLike | null
  update: () => Promise<unknown>
}

export interface ServiceWorkerContainerLike {
  register: (url: string, options?: { scope?: string }) => Promise<ServiceWorkerRegistrationLike>
  getRegistration: () => Promise<ServiceWorkerRegistrationLike | undefined>
  addEventListener: (type: 'controllerchange', listener: () => void) => void
  removeEventListener: (type: 'controllerchange', listener: () => void) => void
}

export interface VisibilityDocumentLike {
  readonly visibilityState: DocumentVisibilityState
  addEventListener: (type: 'visibilitychange', listener: () => void) => void
  removeEventListener: (type: 'visibilitychange', listener: () => void) => void
}

export interface UpdateControlEnvironment {
  serviceWorker: ServiceWorkerContainerLike
  document: VisibilityDocumentLike
  now: () => number
  reload: () => void
}

/**
 * Registers the worker and arms the catch-up. Returns a function that releases
 * both listeners.
 */
export function startUpdateControl(environment: UpdateControlEnvironment): () => void {
  const { serviceWorker, document, now, reload } = environment

  /** Set only when this page asked a worker to take over, so a first-ever
   * install's `controllerchange` does not reload a page nobody asked to reload. */
  let takeOverRequested = false
  let reloaded = false
  let hiddenSince: number | null = null

  const onControllerChange = () => {
    if (!takeOverRequested || reloaded) return
    reloaded = true
    reload()
  }

  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      hiddenSince = now()
      return
    }
    if (document.visibilityState !== 'visible') return

    const wentHiddenAt = hiddenSince
    hiddenSince = null
    if (wentHiddenAt === null) return
    if (now() - wentHiddenAt <= HIDDEN_CATCH_UP_MS) return

    void catchUp().catch(() => {
      // Being offline is the ordinary case on this path, not an exception:
      // `registration.update()` rejects when sw.js cannot be fetched, which is
      // the airplane mode the app is built to keep working in. The worker stays
      // waiting and the next cold start or long absence picks it up. Nothing to
      // report, and nowhere to report it — there is no telemetry.
    })
  }

  /**
   * Bounded: it looks once, checks for a new version once, and takes over only
   * what is waiting by the time that check settles. There is no open-ended
   * listener, so a version that lands later waits for the next cold start or
   * the next long absence rather than reloading the app under the user.
   */
  async function catchUp(): Promise<void> {
    const registration = await serviceWorker.getRegistration()
    if (!registration) return

    // A long-warm app never navigates, so nothing else would ever look.
    if (!registration.waiting) await registration.update()

    const waiting = registration.waiting
    if (!waiting) return

    takeOverRequested = true
    waiting.postMessage(SKIP_WAITING_MESSAGE)
  }

  serviceWorker.addEventListener('controllerchange', onControllerChange)
  document.addEventListener('visibilitychange', onVisibilityChange)

  void serviceWorker.register(SERVICE_WORKER_URL, { scope: '/' }).catch(() => {
    // An unregistrable worker costs offline, not the app. Nothing to report to
    // the user and nowhere to report it — there is no telemetry.
  })

  return () => {
    serviceWorker.removeEventListener('controllerchange', onControllerChange)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }
}

/** Wires the catch-up to the real browser, when it has a service worker at all. */
export function startUpdateControlInBrowser(): () => void {
  if (!('serviceWorker' in navigator)) return () => {}
  return startUpdateControl({
    serviceWorker: navigator.serviceWorker,
    document: window.document,
    now: () => Date.now(),
    reload: () => window.location.reload(),
  })
}
