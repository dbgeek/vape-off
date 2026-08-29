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
