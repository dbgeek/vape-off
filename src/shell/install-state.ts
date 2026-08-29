/**
 * Install detection.
 *
 * iOS never fires `beforeinstallprompt`, so there is no one-tap install and no
 * compliance signal. The app learns that installation worked only by later
 * finding itself standalone. Either signal is sufficient.
 *
 * `navigator.storage.persisted()` is deliberately **not** the check — it
 * returned `false` on two installed instances on a real device (#12), and
 * WebKit grants persistence on the basis of Home Screen installation anyway.
 */

export interface InstallEnvironment {
  matchMedia: (query: string) => { matches: boolean }
  navigator: { standalone?: boolean | undefined }
}

const STANDALONE_QUERY = '(display-mode: standalone)'

export function isStandalone(environment: InstallEnvironment = window): boolean {
  return environment.matchMedia(STANDALONE_QUERY).matches || environment.navigator.standalone === true
}
