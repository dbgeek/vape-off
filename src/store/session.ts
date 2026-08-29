import type { DayLedgerRecord } from '../domain/day-ledger.ts'
import { deviceTimeZone } from '../domain/logical-day.ts'
import { updateBadge, type BadgeController } from '../shell/badge.ts'
import { buildIdentity, type BuildIdentity } from '../shell/build-identity.ts'
import { browserDatabase } from './browser-database.ts'
import type { VapeOffDatabase } from './database.ts'
import { openDatabase } from './open-database.ts'
import { readRecord } from './read-record.ts'
import { evaluate, type EvaluationResult } from './ratchet-writes.ts'

/**
 * The connection's owner: one session sits behind Track, Stats and Backup, and
 * holds everything that is true of the store rather than of a screen — when the
 * database opens, how the whole record is read, when the Ratchet is evaluated,
 * that the badge follows a read, and that a deleted database is reopened here
 * and nowhere else. The adapters keep only the operations their screen calls.
 */

/** The browser facts every store operation draws on. */
export interface StoreEnvironment {
  now: () => Date
  timeZone: () => string
  randomUUID: () => string
}

/** What a write needs: a zone to stamp with and an id. Writes are told the instant. */
export type WriteEnvironment = Pick<StoreEnvironment, 'timeZone' | 'randomUUID'>

/** The shared facts, plus the two the slices add: Track and Stats badge, Backup stamps the build. */
export interface SessionEnvironment extends StoreEnvironment {
  badge: BadgeController
  appBuild: BuildIdentity
}

export const browserEnvironment: SessionEnvironment = {
  now: () => new Date(),
  timeZone: () => deviceTimeZone(),
  randomUUID: () => crypto.randomUUID(),
  badge: navigator,
  appBuild: buildIdentity,
}

export interface StoreSession {
  /** The connection the session keeps open. Adapters write through it; only the session opens it. */
  readonly db: VapeOffDatabase
  readonly environment: SessionEnvironment
  /** Opens the connection, once, however many callers ask. */
  ensureOpen: () => Promise<void>
  readRecord: () => Promise<DayLedgerRecord>
  /** Runs the Ratchet's evaluation, as of `at` when a screen is working in a past moment. */
  evaluate: (at?: Date) => Promise<EvaluationResult>
  /** Best-effort: a badge that refuses never fails the read or the write behind it. */
  refreshBadge: (record: DayLedgerRecord, at: Date) => Promise<void>
  /** Discards the database and reopens it — the recovery path, and a lifecycle fact, not a secret. */
  reset: () => Promise<void>
}

export function createStoreSession(
  db: VapeOffDatabase,
  environment: SessionEnvironment = browserEnvironment,
): StoreSession {
  let opening: Promise<void> | undefined

  async function ensureOpen(): Promise<void> {
    if (db.isOpen()) return
    opening ??= openDatabase(db, environment.randomUUID).then((result) => {
      if (result.status !== 'ok') throw new Error(`Database is ${result.status}`)
    })
    await opening
  }

  return {
    db,
    environment,
    ensureOpen,
    readRecord: () => readRecord(db),

    evaluate(at) {
      return evaluate(db, at === undefined ? environment : { ...environment, now: () => at })
    },

    async refreshBadge(record, at) {
      try {
        await updateBadge(record, at, environment.timeZone(), environment.badge)
      } catch {
        // Badging is a best-effort browser affordance; the record is already safe.
      }
    },

    async reset() {
      db.close()
      await db.delete()
      opening = undefined
      await ensureOpen()
    },
  }
}

/** One store session behind the three browser adapters. */
export const browserSession = createStoreSession(browserDatabase)
