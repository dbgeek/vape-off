/**
 * The build identity. Updates are silent, so this is the only way to tell what
 * is running. Both values are injected by Vite at build time.
 */

export interface BuildIdentity {
  /** Short git SHA, or `unknown` if the build container had neither git nor Vercel's env. */
  sha: string
  /** ISO-8601 instant the build was cut. */
  builtAt: string
}

export const buildIdentity: BuildIdentity = {
  sha: __BUILD_SHA__,
  builtAt: __BUILD_TIME__,
}

/**
 * Rendered in UTC rather than the device's zone: the identity is a fact about
 * the build, not about the reader, and the app's one time-zone-sensitive
 * concept is the Logical Day.
 */
export function formatBuildIdentity(identity: BuildIdentity = buildIdentity): string {
  const built = new Date(identity.builtAt)
  if (Number.isNaN(built.getTime())) return `${identity.sha} · unknown`
  const stamp = built.toISOString().slice(0, 16).replace('T', ' ')
  return `${identity.sha} · ${stamp} UTC`
}
