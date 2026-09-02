import { useEffect, useRef, type PointerEvent, type SyntheticEvent } from 'react'

/**
 * The mark as a handle for two routes into one act (`screens.md` § Marking a
 * Kick).
 *
 * A tap opens the editor and a held press toggles the Kick — the same target,
 * the same reach, the same semantics, and one of them a fast path for something
 * that happens several times a day. **Neither half survives alone**: a
 * long-press is undiscoverable and has no keyboard or screen-reader equivalent,
 * and the editor alone costs three taps on the screen whose thesis is that
 * logging costs under a second.
 *
 * The two routes are told apart *here*, on one element, rather than by giving
 * the Kick a control of its own — a third button on Track was refused on the
 * chrome budget, and a prompt after every sitting more sharply still, as the
 * second decision on every log that ADR 0010 exists to prevent.
 *
 * Handed out per mark and never per lane: the Yesterday lane is read-only
 * structurally, and what that means is that nothing there is ever handed this.
 */

/**
 * How long a press is held before it marks.
 *
 * The platform figure — long enough that a tap aimed at the editor is never
 * read as a hold, short enough that the fast path stays faster than the three
 * taps it exists to save.
 */
export const LONG_PRESS_MS = 500

/**
 * How far a held pointer may travel and still be a press, in px.
 *
 * Not zero, and the reason is the target: the smallest mark the fan draws is
 * 20px, so a thumb covering it is holding something it cannot see, and a press
 * cancelled by the wobble that costs would send the reader to the editor route
 * every time. Beyond it the pointer is going somewhere, and a press that
 * travels is not a press.
 */
export const LONG_PRESS_SLOP = 10

/** Every handler a mark needs to carry both routes, ready to spread. */
export interface MarkGesture {
  onPointerDown: (event: PointerEvent) => void
  onPointerMove: (event: PointerEvent) => void
  onPointerUp: () => void
  onPointerCancel: () => void
  onPointerLeave: () => void
  onClick: (event: { detail: number }) => void
  onContextMenu: (event: SyntheticEvent) => void
}

export function useMarkGesture({ tap, hold }: { tap: () => void; hold: () => void }): MarkGesture {
  const pending = useRef<number>(undefined)
  const from = useRef<{ x: number; y: number }>(undefined)
  /**
   * Whether the press already acted. The browser sends a `click` after a held
   * press like it does after any other, so without this one hold would mark the
   * Kick and then open the editor on top of it.
   */
  const marked = useRef(false)

  function forget() {
    if (pending.current !== undefined) window.clearTimeout(pending.current)
    pending.current = undefined
  }

  // A mark can leave under a finger still holding it — a Correction elsewhere,
  // a reload, the Logical Day turning over — and a timer that outlives its mark
  // would mark a session nobody is pressing.
  useEffect(() => forget, [])

  return {
    onPointerDown(event) {
      forget()
      marked.current = false
      from.current = { x: event.clientX, y: event.clientY }
      pending.current = window.setTimeout(() => {
        pending.current = undefined
        // Set before the write rather than after it, because the `click` this
        // is racing is the release of this very press.
        marked.current = true
        hold()
      }, LONG_PRESS_MS)
    },
    onPointerMove(event) {
      if (pending.current === undefined || from.current === undefined) return
      const travelled = Math.hypot(event.clientX - from.current.x, event.clientY - from.current.y)
      if (travelled > LONG_PRESS_SLOP) forget()
    },
    onPointerUp: forget,
    onPointerCancel: forget,
    // A pointer that leaves the mark has stopped pressing it, whatever the slop
    // above would allow. It is the mouse this answers: touch holds an implicit
    // pointer capture, so a thumb sliding within the slop never leaves.
    onPointerLeave: forget,
    onClick(event) {
      // `detail` counts the clicks behind this one, and a keyboard's has none:
      // Enter and Space on a focused mark arrive as a `click` with `detail` 0.
      // The keyboard therefore always takes the editor route, which is the only
      // route it has — and cannot be swallowed by a press whose own `click`
      // never came, after a release off the mark or a scroll the browser took.
      const fromThePointer = event.detail !== 0
      const alreadyMarked = marked.current
      marked.current = false
      if (fromThePointer && alreadyMarked) return
      tap()
    },
    onContextMenu(event) {
      // Half of the iOS fix; `index.css` owes the other half. A held press
      // raises the selection callout over the mark just as the Kick is made.
      event.preventDefault()
    },
  }
}
