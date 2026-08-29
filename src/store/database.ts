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
export const SCHEMA_VERSION = 1
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
    this.version(SCHEMA_VERSION).stores(STORE_SCHEMA)
  }
}
