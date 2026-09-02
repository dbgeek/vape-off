import Dexie, { type EntityTable } from 'dexie'
import type {
  ClearDay,
  ExportRecord,
  MetaRecord,
  PuffSession,
  RatchetStep,
  ResistedUrge,
} from './records.ts'

export const DATABASE_NAME = 'vape-off'
export const SCHEMA_VERSION = 2
export const STORE_SCHEMA = {
  puffSessions: '&id, logicalDay, at, [logicalDay+at]',
  resistedUrges: '&id, logicalDay, at, [logicalDay+at]',
  clearDays: '&logicalDay',
  ratchetSteps: '&id, &effectiveFrom',
  exports: '&id, logicalDay, at',
  meta: '&key',
} as const

export class VapeOffDatabase extends Dexie {
  puffSessions!: EntityTable<PuffSession, 'id'>
  resistedUrges!: EntityTable<ResistedUrge, 'id'>
  clearDays!: EntityTable<ClearDay, 'logicalDay'>
  ratchetSteps!: EntityTable<RatchetStep, 'id'>
  exports!: EntityTable<ExportRecord, 'id'>
  meta!: EntityTable<MetaRecord, 'key'>

  constructor(name = DATABASE_NAME) {
    super(name)
    // `version(1)` is frozen. The Kick added a field and no index, so `version(2)`
    // declares the same stores and has nothing for an `upgrade()` to do — absent
    // already reads as Unknown on every existing row. It is declared anyway
    // because the number answers to the *older than your data* guard as well as
    // to the index list: without it a pre-Kick build opens a Kick-carrying
    // database, sees 1 == 1, and exports a Backup with every Kick stripped
    // (ADR 0005). `SCHEMA_VERSION` is the highest version declared.
    this.version(1).stores(STORE_SCHEMA)
    this.version(2).stores(STORE_SCHEMA)
  }
}
