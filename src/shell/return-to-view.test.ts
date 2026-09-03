import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useReturnToView } from './return-to-view.ts'

/**
 * Tested directly rather than through its two screens, because both of its
 * failure modes are invisible from there: a listener that never detaches leaks
 * across unmounts, and a listener that fires on the way *out* re-reads the store
 * in the background. Neither shows up in a screen test that mounts once and
 * asserts on what is drawn.
 */

/** Puts the document in a visibility state and fires the event the browser would. */
function setVisibility(state: DocumentVisibilityState) {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state)
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('returning to view', () => {
  it('runs the callback when the app comes back', () => {
    const onReturn = vi.fn()
    renderHook(() => useReturnToView(onReturn))

    setVisibility('visible')

    expect(onReturn).toHaveBeenCalledOnce()
  })

  it('says nothing on the way out', () => {
    const onReturn = vi.fn()
    renderHook(() => useReturnToView(onReturn))

    setVisibility('hidden')

    expect(onReturn).not.toHaveBeenCalled()
  })

  it('stops listening once the screen is gone', () => {
    const onReturn = vi.fn()
    const { unmount } = renderHook(() => useReturnToView(onReturn))

    unmount()
    setVisibility('visible')

    expect(onReturn).not.toHaveBeenCalled()
  })

  /**
   * Both callers pass an inline arrow, so the callback is a new function every
   * render. Naming it as a dependency would detach and reattach the listener
   * each time — and a listener briefly absent is one that can miss the event it
   * exists for.
   */
  it('attaches once however often its caller re-renders, and still calls the latest callback', () => {
    const attach = vi.spyOn(document, 'addEventListener')
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(({ onReturn }) => useReturnToView(onReturn), {
      initialProps: { onReturn: first },
    })

    rerender({ onReturn: second })
    setVisibility('visible')

    expect(attach.mock.calls.filter(([type]) => type === 'visibilitychange')).toHaveLength(1)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()
  })
})
