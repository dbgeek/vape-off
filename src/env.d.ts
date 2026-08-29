/// <reference types="vite/client" />

/** Injected by Vite at build time. See `define` in vite.config.ts. */
declare const __BUILD_SHA__: string
/** Injected by Vite at build time. See `define` in vite.config.ts. */
declare const __BUILD_TIME__: string

interface Navigator {
  /** Legacy iOS install signal. Present on Safari only. */
  readonly standalone?: boolean
}
