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

function harness(options: { waiting?: { postMessage: (message: unknown) => void } } = {}) {
  const { registration, updateCalls } = fakeRegistration(options)
  const sw = fakeContainer(registration)
  const doc = fakeDocument()
  const clock = fakeClock()
  const reload = vi.fn()
  return { registration, updateCalls, sw, doc, clock, reload }
}

let h: ReturnType<typeof harness>

function start(hh: ReturnType<typeof harness> = h) {
  return startUpdateControl({
    serviceWorker: hh.sw.container,
    document: hh.doc.document,
    now: hh.clock.now,
    reload: hh.reload,
  })
}

/** Let the controller's queued promises settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  h = harness()
})

describe('registration', () => {
  it('registers the worker at its root scope', async () => {
    start()
    await settle()
    expect(h.sw.registered).toEqual(['/sw.js'])
  })

  it('leaves a worker that is already waiting alone — updates are never mid-session', async () => {
    const waiting = fakeWaitingWorker()
    h = harness({ waiting: waiting.worker })
    start()
    await settle()
    expect(waiting.messages).toEqual([])
    expect(h.reload).not.toHaveBeenCalled()
  })
})

describe('the bounded catch-up', () => {
  it('takes over a waiting worker after more than 30 minutes hidden', async () => {
    const waiting = fakeWaitingWorker()
    h = harness({ waiting: waiting.worker })
    start()
    await settle()

    h.doc.go('hidden')
    h.clock.advance(HIDDEN_CATCH_UP_MS + 1)
    h.doc.go('visible')
    await settle()

    expect(waiting.messages).toEqual([SKIP_WAITING_MESSAGE])
  })

  it('leaves the worker waiting when the app was hidden for less than 30 minutes', async () => {
    const waiting = fakeWaitingWorker()
    h = harness({ waiting: waiting.worker })
    start()
    await settle()

    h.doc.go('hidden')
    h.clock.advance(HIDDEN_CATCH_UP_MS - 1)
    h.doc.go('visible')
    await settle()

    expect(waiting.messages).toEqual([])
    expect(h.updateCalls()).toBe(0)
  })

  it('does not arm from a return to visible that followed no hidden stretch', async () => {
    const waiting = fakeWaitingWorker()
    h = harness({ waiting: waiting.worker })
    start()
    await settle()

    h.clock.advance(HIDDEN_CATCH_UP_MS * 10)
    h.doc.go('visible')
    await settle()

    expect(waiting.messages).toEqual([])
  })

  it('checks for a new version when nothing is waiting, and takes over what it finds', async () => {
    const waiting = fakeWaitingWorker()
    h = harness()
    // The update check is what turns a long-warm app into one with a waiting worker.
    h.registration.onUpdate = async () => {
      h.registration.waiting = waiting.worker
    }
    start()
    await settle()

    h.doc.go('hidden')
    h.clock.advance(HIDDEN_CATCH_UP_MS + 1)
    h.doc.go('visible')
    await settle()

    expect(h.updateCalls()).toBe(1)
    expect(waiting.messages).toEqual([SKIP_WAITING_MESSAGE])
  })

  it('does nothing when the update check finds no new version', async () => {
    start()
    await settle()

    h.doc.go('hidden')
    h.clock.advance(HIDDEN_CATCH_UP_MS + 1)
    h.doc.go('visible')
    await settle()

    expect(h.updateCalls()).toBe(1)
    expect(h.reload).not.toHaveBeenCalled()
  })

  it('re-arms for the next long absence', async () => {
    const waiting = fakeWaitingWorker()
    h = harness({ waiting: waiting.worker })
    start()
    await settle()

    h.doc.go('hidden')
    h.clock.advance(HIDDEN_CATCH_UP_MS - 1)
    h.doc.go('visible')
    await settle()
    expect(waiting.messages).toEqual([])

    h.doc.go('hidden')
    h.clock.advance(HIDDEN_CATCH_UP_MS + 1)
    h.doc.go('visible')
    await settle()
    expect(waiting.messages).toEqual([SKIP_WAITING_MESSAGE])
  })
})

describe('the reload that makes skipWaiting safe', () => {
  it('reloads on controllerchange once it has asked a worker to take over', async () => {
    const waiting = fakeWaitingWorker()
    h = harness({ waiting: waiting.worker })
    start()
    await settle()

    h.doc.go('hidden')
    h.clock.advance(HIDDEN_CATCH_UP_MS + 1)
    h.doc.go('visible')
    await settle()

    h.sw.fireControllerChange()
    expect(h.reload).toHaveBeenCalledTimes(1)
  })

  it('does not reload on the controllerchange of a first-ever install', async () => {
    start()
    await settle()

    h.sw.fireControllerChange()
    expect(h.reload).not.toHaveBeenCalled()
  })

  it('reloads once even if controllerchange fires more than once', async () => {
    const waiting = fakeWaitingWorker()
    h = harness({ waiting: waiting.worker })
    start()
    await settle()

    h.doc.go('hidden')
    h.clock.advance(HIDDEN_CATCH_UP_MS + 1)
    h.doc.go('visible')
    await settle()

    h.sw.fireControllerChange()
    h.sw.fireControllerChange()
    expect(h.reload).toHaveBeenCalledTimes(1)
  })
})

describe('stopping', () => {
  it('releases both listeners', async () => {
    const stop = start()
    await settle()
    expect(h.doc.listenerCount()).toBe(1)
    expect(h.sw.listenerCount()).toBe(1)

    stop()
    expect(h.doc.listenerCount()).toBe(0)
    expect(h.sw.listenerCount()).toBe(0)
  })
})
