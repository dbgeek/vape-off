import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  HIDDEN_CATCH_UP_MS,
  SKIP_WAITING_MESSAGE,
  startUpdateControl,
  type ServiceWorkerContainerLike,
  type ServiceWorkerRegistrationLike,
  type VisibilityDocumentLike,
} from './update-control.ts'

/** A waiting worker that records what the page told it to do. */
function fakeWaitingWorker() {
  const messages: unknown[] = []
  return { worker: { postMessage: (message: unknown) => messages.push(message) }, messages }
}

function fakeRegistration(options: { waiting?: { postMessage: (message: unknown) => void } } = {}) {
  let updateCalls = 0
  const registration = {
    waiting: options.waiting ?? null,
    update: async () => {
      updateCalls += 1
      await registration.onUpdate?.()
    },
  } as ServiceWorkerRegistrationLike & {
    waiting: { postMessage: (message: unknown) => void } | null
    onUpdate?: () => Promise<void>
  }
  return { registration, updateCalls: () => updateCalls }
}

function fakeContainer(registration: ServiceWorkerRegistrationLike) {
  const registered: string[] = []
  const listeners = new Set<() => void>()
  const container: ServiceWorkerContainerLike = {
    register: async (url: string) => {
      registered.push(url)
      return registration
    },
    getRegistration: async () => registration,
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
  }
  return {
    container,
    registered,
    listenerCount: () => listeners.size,
    fireControllerChange: () => listeners.forEach((listener) => listener()),
  }
}

function fakeDocument() {
  const listeners = new Set<() => void>()
  const doc = {
    visibilityState: 'visible' as DocumentVisibilityState,
    addEventListener: (_type: 'visibilitychange', listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: 'visibilitychange', listener: () => void) =>
      listeners.delete(listener),
  }
  return {
    document: doc as VisibilityDocumentLike,
    listenerCount: () => listeners.size,
    go: (state: DocumentVisibilityState) => {
      doc.visibilityState = state
      listeners.forEach((listener) => listener())
    },
  }
}

/** A clock the test moves by hand. */
function fakeClock(start = 0) {
  let current = start
  return { now: () => current, advance: (ms: number) => (current += ms) }
}

function makeHarness(options: { waiting?: { postMessage: (message: unknown) => void } } = {}) {
  const { registration, updateCalls } = fakeRegistration(options)
  const sw = fakeContainer(registration)
  const doc = fakeDocument()
  const clock = fakeClock()
  const reload = vi.fn()
  return { registration, updateCalls, sw, doc, clock, reload }
}

type Harness = ReturnType<typeof makeHarness>

/** Rebuilt before each test, and replaced outright by tests that need a waiting worker. */
let harness: Harness

function start(against: Harness = harness) {
  return startUpdateControl({
    serviceWorker: against.sw.container,
    document: against.doc.document,
    now: against.clock.now,
    reload: against.reload,
  })
}

/** Let the controller's queued promises settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  harness = makeHarness()
})

describe('registration', () => {
  it('registers the worker at its root scope', async () => {
    start()
    await settle()
    expect(harness.sw.registered).toEqual(['/sw.js'])
  })

  it('leaves a worker that is already waiting alone — updates are never mid-session', async () => {
    const waiting = fakeWaitingWorker()
    harness = makeHarness({ waiting: waiting.worker })
    start()
    await settle()
    expect(waiting.messages).toEqual([])
    expect(harness.reload).not.toHaveBeenCalled()
  })
})

describe('the bounded catch-up', () => {
  it('takes over a waiting worker after more than 30 minutes hidden', async () => {
    const waiting = fakeWaitingWorker()
    harness = makeHarness({ waiting: waiting.worker })
    start()
    await settle()

    harness.doc.go('hidden')
    harness.clock.advance(HIDDEN_CATCH_UP_MS + 1)
    harness.doc.go('visible')
    await settle()

    expect(waiting.messages).toEqual([SKIP_WAITING_MESSAGE])
  })

  it('leaves the worker waiting when the app was hidden for less than 30 minutes', async () => {
    const waiting = fakeWaitingWorker()
    harness = makeHarness({ waiting: waiting.worker })
    start()
    await settle()

    harness.doc.go('hidden')
    harness.clock.advance(HIDDEN_CATCH_UP_MS - 1)
    harness.doc.go('visible')
    await settle()

    expect(waiting.messages).toEqual([])
    expect(harness.updateCalls()).toBe(0)
  })

  it('does not arm from a return to visible that followed no hidden stretch', async () => {
    const waiting = fakeWaitingWorker()
    harness = makeHarness({ waiting: waiting.worker })
    start()
    await settle()

    harness.clock.advance(HIDDEN_CATCH_UP_MS * 10)
    harness.doc.go('visible')
    await settle()

    expect(waiting.messages).toEqual([])
  })

  it('checks for a new version when nothing is waiting, and takes over what it finds', async () => {
    const waiting = fakeWaitingWorker()
    harness = makeHarness()
    // The update check is what turns a long-warm app into one with a waiting worker.
    harness.registration.onUpdate = async () => {
      harness.registration.waiting = waiting.worker
    }
    start()
    await settle()

    harness.doc.go('hidden')
    harness.clock.advance(HIDDEN_CATCH_UP_MS + 1)
    harness.doc.go('visible')
    await settle()

    expect(harness.updateCalls()).toBe(1)
    expect(waiting.messages).toEqual([SKIP_WAITING_MESSAGE])
  })

  it('does nothing when the update check finds no new version', async () => {
    start()
    await settle()

    harness.doc.go('hidden')
    harness.clock.advance(HIDDEN_CATCH_UP_MS + 1)
    harness.doc.go('visible')
    await settle()

    expect(harness.updateCalls()).toBe(1)
    expect(harness.reload).not.toHaveBeenCalled()
  })

  it('survives an update check that fails, which offline is', async () => {
    const rejections: unknown[] = []
    const onUnhandled = (reason: unknown) => rejections.push(reason)
    process.on('unhandledRejection', onUnhandled)
    try {
      // registration.update() rejects when sw.js cannot be fetched — the
      // airplane mode this app is built to keep working in.
      harness.registration.onUpdate = async () => {
        throw new Error('Failed to fetch')
      }
      start()
      await settle()

      harness.doc.go('hidden')
      harness.clock.advance(HIDDEN_CATCH_UP_MS + 1)
      harness.doc.go('visible')
      await settle()
      await settle()

      expect(rejections).toEqual([])
      expect(harness.reload).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })

  it('re-arms for the next long absence', async () => {
    const waiting = fakeWaitingWorker()
    harness = makeHarness({ waiting: waiting.worker })
    start()
    await settle()

    harness.doc.go('hidden')
    harness.clock.advance(HIDDEN_CATCH_UP_MS - 1)
    harness.doc.go('visible')
    await settle()
    expect(waiting.messages).toEqual([])

    harness.doc.go('hidden')
    harness.clock.advance(HIDDEN_CATCH_UP_MS + 1)
    harness.doc.go('visible')
    await settle()
    expect(waiting.messages).toEqual([SKIP_WAITING_MESSAGE])
  })
})

describe('the reload that makes skipWaiting safe', () => {
  it('reloads on controllerchange once it has asked a worker to take over', async () => {
    const waiting = fakeWaitingWorker()
    harness = makeHarness({ waiting: waiting.worker })
    start()
    await settle()

    harness.doc.go('hidden')
    harness.clock.advance(HIDDEN_CATCH_UP_MS + 1)
    harness.doc.go('visible')
    await settle()

    harness.sw.fireControllerChange()
    expect(harness.reload).toHaveBeenCalledTimes(1)
  })

  it('does not reload on the controllerchange of a first-ever install', async () => {
    start()
    await settle()

    harness.sw.fireControllerChange()
    expect(harness.reload).not.toHaveBeenCalled()
  })

  it('reloads once even if controllerchange fires more than once', async () => {
    const waiting = fakeWaitingWorker()
    harness = makeHarness({ waiting: waiting.worker })
    start()
    await settle()

    harness.doc.go('hidden')
    harness.clock.advance(HIDDEN_CATCH_UP_MS + 1)
    harness.doc.go('visible')
    await settle()

    harness.sw.fireControllerChange()
    harness.sw.fireControllerChange()
    expect(harness.reload).toHaveBeenCalledTimes(1)
  })
})

describe('stopping', () => {
  it('releases both listeners', async () => {
    const stop = start()
    await settle()
    expect(harness.doc.listenerCount()).toBe(1)
    expect(harness.sw.listenerCount()).toBe(1)

    stop()
    expect(harness.doc.listenerCount()).toBe(0)
    expect(harness.sw.listenerCount()).toBe(0)
  })
})
