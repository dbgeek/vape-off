import { readFileSync } from 'node:fs'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LONG_PRESS_MS, LONG_PRESS_SLOP, useMarkGesture } from './mark-gesture.ts'

/**
 * The mark's two routes into one act (`screens.md` § Marking a Kick).
 *
 * Tested on a bare button rather than through Track, because the claims here are
 * about the *gesture* — what a held press does that a tap does not, and what a
 * drag does that neither does — and every one of them is a claim a plausible
 * edit would break silently. The screen's own tests then ask the other half of
 * the question: which marks are handed this at all.
 */
function Harness({ tap, hold }: { tap: () => void; hold: () => void }) {
  return (
    <button type="button" {...useMarkGesture({ tap, hold })}>
      a mark
    </button>
  )
}

function mark(tap = vi.fn(), hold = vi.fn()) {
  render(<Harness tap={tap} hold={hold} />)
  return { element: screen.getByRole('button'), tap, hold }
}

/** Hold the press for as long as it takes, letting the timer that marks fire. */
function hold(element: HTMLElement, forMs = LONG_PRESS_MS) {
  fireEvent.pointerDown(element, { clientX: 100, clientY: 100 })
  act(() => vi.advanceTimersByTime(forMs))
}

/**
 * Let go: the pointer lifts, and the browser's click follows it.
 *
 * `detail` is what tells that click from the keyboard's — it counts the clicks
 * behind this one, and a pointer's is at least the first.
 */
function release(element: HTMLElement) {
  fireEvent.pointerUp(element)
  fireEvent.click(element, { detail: 1 })
}

describe('a mark as a gesture', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('marks on a held press, and does not also open the editor when it releases', () => {
    vi.useFakeTimers()
    const { element, tap, hold: marked } = mark()

    hold(element)
    expect(marked).toHaveBeenCalledOnce()

    // The press has already acted, and the browser sends a `click` after every
    // one of them. Without swallowing it, one held press would mark the Kick
    // *and* open the editor on top of it — the fast path landing you on the
    // findable one every time.
    release(element)
    expect(tap).not.toHaveBeenCalled()
    expect(marked).toHaveBeenCalledOnce()
  })

  it('opens the editor on a tap, and marks nothing', () => {
    vi.useFakeTimers()
    const { element, tap, hold: marked } = mark()

    fireEvent.pointerDown(element, { clientX: 100, clientY: 100 })
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS - 1))
    release(element)

    expect(tap).toHaveBeenCalledOnce()
    expect(marked).not.toHaveBeenCalled()

    // And the timer the tap started is gone rather than pending: a mark that
    // fired one beat after the editor opened would be a Kick nobody asked for.
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS))
    expect(marked).not.toHaveBeenCalled()
  })

  it('opens the editor from the keyboard, which is a click and no pointer at all', () => {
    vi.useFakeTimers()
    const { element, tap, hold: marked } = mark()

    // Enter and Space on a focused `<button>` arrive as a `click` carrying no
    // clicks behind it. This is the whole of the keyboard's route onto Track's
    // marks — a held press has no keyboard equivalent, which is why the editor
    // carries the toggle.
    fireEvent.click(element)

    expect(tap).toHaveBeenCalledOnce()
    expect(marked).not.toHaveBeenCalled()
  })

  it.each([
    ['lets go early', (element: HTMLElement) => fireEvent.pointerUp(element)],
    ['slides off the mark', (element: HTMLElement) => fireEvent.pointerLeave(element)],
    ['is taken over by the browser', (element: HTMLElement) => fireEvent.pointerCancel(element)],
    [
      'drags rather than holds',
      (element: HTMLElement) =>
        fireEvent.pointerMove(element, { clientX: 100 + LONG_PRESS_SLOP + 1, clientY: 100 }),
    ],
  ])('marks nothing when the press %s', (_description, interrupt) => {
    vi.useFakeTimers()
    const { element, hold: marked } = mark()

    fireEvent.pointerDown(element, { clientX: 100, clientY: 100 })
    interrupt(element)
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS * 2))

    expect(marked).not.toHaveBeenCalled()
  })

  it('holds through a wobbling thumb, because the smallest mark is 20px', () => {
    vi.useFakeTimers()
    const { element, hold: marked } = mark()

    fireEvent.pointerDown(element, { clientX: 100, clientY: 100 })
    fireEvent.pointerMove(element, { clientX: 100 + LONG_PRESS_SLOP, clientY: 100 })
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS))

    expect(marked).toHaveBeenCalledOnce()
  })

  it('marks and un-marks by the same gesture, twice running', () => {
    vi.useFakeTimers()
    const { element, tap, hold: marked } = mark()

    hold(element)
    release(element)
    hold(element)
    release(element)

    // Taking a mark back is the same gesture that made it, so the second press
    // has to be a press and not a swallowed click left over from the first.
    expect(marked).toHaveBeenCalledTimes(2)
    expect(tap).not.toHaveBeenCalled()
  })

  it('still opens the editor from the keyboard after a press whose click never came', () => {
    vi.useFakeTimers()
    const { element, tap, hold: marked } = mark()

    // A held press does not always end in a click: the release can land off the
    // mark, or the browser can take the pointer for a scroll. The press has
    // still acted, so nothing more is owed to it — but the flag that says so
    // must not be left lying where the keyboard walks.
    hold(element)
    fireEvent.pointerCancel(element)
    expect(marked).toHaveBeenCalledOnce()

    // The toggle behind this door is the only keyboard- and screen-reader-
    // reachable route to the act. Swallowing this click closes it.
    fireEvent.click(element)
    expect(tap).toHaveBeenCalledOnce()
  })

  it('marks nothing after the mark it was pressed on has gone', () => {
    vi.useFakeTimers()
    const marked = vi.fn()
    const view = render(<Harness tap={vi.fn()} hold={marked} />)

    fireEvent.pointerDown(screen.getByRole('button'), { clientX: 100, clientY: 100 })
    view.unmount()
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS * 2))

    expect(marked).not.toHaveBeenCalled()
  })

  it('suppresses the context menu the held press would otherwise raise', () => {
    const { element } = mark()

    // iOS raises a selection callout over a held element, and Android a context
    // menu; either one lands on top of the mark just as the Kick is made.
    expect(fireEvent.contextMenu(element)).toBe(false)
  })
})

describe("the mark's stylesheet, on the same fix", () => {
  const stylesheet = readFileSync('src/index.css', 'utf8')
  const rule = /\.puff-mark \{([^}]*)\}/.exec(stylesheet)?.[1] ?? ''

  it('refuses iOS the selection callout on a held mark', () => {
    // The other half of the callout fix, and it is CSS: suppressing the event is
    // not enough, because the callout and the selection are raised by the hold
    // itself. Both are owed together — `.puff-mark` is a 20px target with a
    // numeral printed in it, and a held press on it selects the numeral.
    expect(rule).toContain('-webkit-touch-callout: none')
    expect(rule).toContain('-webkit-user-select: none')
    expect(rule).toContain('user-select: none')
  })

  it('leaves the Yesterday lane out of it, having nothing to suppress', () => {
    // The lane is read-only structurally: it is handed ids and never a handler,
    // so no press on it is ever held long enough to raise anything.
    expect(/\.yesterday-mark \{[^}]*touch-callout/.test(stylesheet)).toBe(false)
  })
})
