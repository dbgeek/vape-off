import '@testing-library/jest-dom/vitest'

// jsdom does not implement matchMedia. The app asks it exactly one question —
// `(display-mode: standalone)` — and under jsdom the honest answer is "no".
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

// jsdom does not implement ResizeObserver either, and it does not lay anything
// out, so nothing it draws ever changes size. Track watches the timeline's box
// because the fan needs real pixels; under jsdom the honest answer is that the
// box never resizes, and the one direct measurement it takes reports zero.
if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof window.ResizeObserver
}
