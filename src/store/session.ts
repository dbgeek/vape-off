import type { DayLedgerRecord } from '../domain/day-ledger.ts'
import { deviceTimeZone } from '../domain/logical-day.ts'
import { updateBadge, type BadgeController } from '../shell/badge.ts'
import { browserDatabase } from './browser-database.ts'
import type { VapeOffDatabase } from './database.ts'
import { openDatabase } from './open-database.ts'
import { readRecord } from './read-record.ts'
import { evaluate, type EvaluationResult } from './ratchet-writes.ts'

/**
 * The connection's owner: one session sits behind Track, Stats and Backup, and
 * owns the lifecycle none of them owns alone — when the database opens, how the
 * whole record is read, that the badge follows a read, what always follows a
 * write, and that a deleted database is reopened here and nowhere else. The
 * adapters keep only the operations their screen calls.
 *
 * **Opening is nobody's to remember.** Every member below opens the connection
 * first, so there is no order to get right and no `ensureOpen` to forget. An
 * ordering constraint a caller has to know is part of the interface, and that
 * one restated a guarantee the session was already making.
 *
 * **A read leaves the badge agreeing with the record** (ADR 0016), which is why
 * `readRecord` refreshes it rather than offering a separate refresh a caller
 * could skip. The badge sits on the environment because keeping it in step is
 * the session's job. A slice's own extras stay with the slice.
 */

/** The browser facts every store operation draws on. */
export interface StoreEnvironment {
  now: () => Date
  timeZone: () => string
  randomUUID: () => string
}

/** What a write needs: a zone to stamp with and an id. Writes are told the instant. */
export type WriteEnvironment = Pick<StoreEnvironment, 'timeZone' | 'randomUUID'>

/** The shared facts, plus the badge the session keeps in step with the record. */
export interface SessionEnvironment extends StoreEnvironment {
  badge: BadgeController
}

const browserEnvironment: SessionEnvironment = {
  now: () => new Date(),
  timeZone: () => deviceTimeZone(),
  randomUUID: () => crypto.randomUUID(),
  badge: navigator,
}

/**
 * What a write produced, and the record it produced it in.
 *
 * The operation's own answer travels back beside the record because one caller
 * needs it — a Correction the record refused has to say so — and the rest read
 * `record` and ignore it. A write answering only with the record would send that
 * one caller round the outside to ask again.
 */
export interface WriteResult<Produced> {
  result: Produced
  record: DayLedgerRecord
}

export interface StoreSession {
  /**
   * The open connection, for the extras a slice keeps of its own — its `meta`
   * keys, its `exports` rows.
   *
   * A function rather than a property so that the database cannot be reached
   * without being open. Handing out a closed connection and asking callers to
   * open it first is the ordering constraint this module exists to remove: it
   * compiles either way, and the one caller that forgets is found by a user.
   */
  database: () => Promise<VapeOffDatabase>
  readonly environment: SessionEnvironment
  /**
   * The whole record, with the badge left agreeing with it.
   *
   * It does not evaluate the Ratchet. Reading is not deciding, and the one read
   * that must not decide is the Backup's: evaluating mid-export could write a
   * Ratchet Step into the very file being handed off.
   */
  readRecord: () => Promise<DayLedgerRecord>
  /** Runs the Ratchet's evaluation, as of `at` when a screen is working in a past moment. */
  evaluate: (at?: Date) => Promise<EvaluationResult>
  /**
   * A write, and everything that always follows one: the Ratchet evaluated, the
   * record read back, the badge left agreeing with it.
   *
   * Evaluated and read as of **now**, never as of the instant written. A
   * Correction and a catch-up Clear Day carry a past `at`, and judging the
   * programme as of a Logical Day that has already finished is a different
   * question from the one a write asks.
   */
  write: <Produced>(
    operation: (db: VapeOffDatabase) => Promise<Produced>,
  ) => Promise<WriteResult<Produced>>
  /**
   * Discards the database and reopens it — the recovery path, and a lifecycle
   * fact, not a secret.
   *
   * The one member that opens **eagerly**, because its caller is recovering from
   * a database that would not open and wants to know the rebuild worked before
   * it navigates away. Left lazy, that failure would surface on a later read, on
   * another screen.
   */
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

  /** Best-effort: a badge that refuses never fails the read or the write behind it. */
  async function refreshBadge(record: DayLedgerRecord, at: Date): Promise<void> {
    try {
      await updateBadge(record, at, environment.timeZone(), environment.badge)
    } catch {
      // Badging is a best-effort browser affordance; the record is already safe.
    }
  }

  async function read(): Promise<DayLedgerRecord> {
    await ensureOpen()
    const record = await readRecord(db)
    await refreshBadge(record, environment.now())
    return record
  }

  return {
    environment,
    readRecord: read,

    async database() {
      await ensureOpen()
      return db
    },

    async evaluate(at) {
      await ensureOpen()
      return evaluate(db, at === undefined ? environment : { ...environment, now: () => at })
    },

    async write(operation) {
      await ensureOpen()
      const result = await operation(db)
      await evaluate(db, environment)
      return { result, record: await read() }
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
