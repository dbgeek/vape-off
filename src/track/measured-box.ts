import { useLayoutEffect, useRef, useState } from 'react'

/**
 * A box's drawn size in px — the one thing about the timeline that cannot be
 * answered without the DOM.
 *
 * A collision is two circles touching, which is a distance in pixels; a
 * percentage cannot answer it. So the fan is handed measurements, and this is
 * how they are taken: for **size alone**, never for a position. Where a thing
 * hangs is time, and time comes from the axis and nothing else (ADR 0013).
 *
 * Two boxes are measured — the timeline, which is the room both lanes fan
 * inside, and the Yesterday lane's head, which is how much of the top of that
 * room is already spoken for. Before the first measurement both read zero,
 * which the fan takes as a lane with room for one column and no head: every
 * mark on the spine, the honest drawing of *not measured yet*.
 */
export interface MeasuredBox {
  width: number
  height: number
}

/** @see MeasuredBox */
export function useMeasuredBox<Element extends HTMLElement>() {
  const box = useRef<Element>(null)
  const [size, setSize] = useState<MeasuredBox>({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const element = box.current
    if (element === null) return

    const measure = () => {
      const { width, height } = element.getBoundingClientRect()
      setSize((current) =>
        current.width === width && current.height === height ? current : { width, height },
      )
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return [box, size] as const
}
