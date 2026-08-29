import type { BuildIdentity } from '../shell/build-identity.ts'
import type {
  ClearDay,
  ExportRecord,
  Instant,
  LogicalDayKey,
  PuffSession,
  RatchetStep,
  ResistedUrge,
} from '../store/records.ts'

export const FORMAT_VERSION = 1

export interface BackupRecord {
  puffSessions: readonly PuffSession[]
  resistedUrges: readonly ResistedUrge[]
  clearDays: readonly ClearDay[]
  ratchetSteps: readonly RatchetStep[]
  exports: readonly ExportRecord[]
}

export interface BackupFileContext {
  schemaVersion: number
  appBuild: BuildIdentity
  exportedAt: Instant
  installId: string
}

export interface CreatedBackupFile {
  file: File
  name: string
  text: string
  type: 'application/json'
}

export interface ParsedBackupFile {
  installId: string
  record: BackupRecord
}

export class BackupFileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackupFileError'
  }
}

const INVALID_BACKUP_MESSAGE = 'This is not a valid vape-off backup.'
const NEWER_BACKUP_MESSAGE = 'This backup was made by a newer version of vape-off.'

type UnknownRecord = Record<string, unknown>
type FormatMigration = (envelope: UnknownRecord) => UnknownRecord

// Add one transform for every previous format when FORMAT_VERSION advances.
const FORMAT_MIGRATIONS: Partial<Record<number, FormatMigration>> = {}

function invalidBackup(): never {
  throw new BackupFileError(INVALID_BACKUP_MESSAGE)
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNonemptyString(value: unknown): value is string {
  return isString(value) && value.length > 0
}

const INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(?:Z|[+-]\d{2}:\d{2})$/
const LOGICAL_DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const validTimeZones = new Map<string, boolean>()

function isInstant(value: unknown): value is Instant {
  return isString(value)
    && INSTANT_PATTERN.test(value)
    && isLogicalDayKey(value.slice(0, 10))
    && Number.isFinite(Date.parse(value))
}

function isLogicalDayKey(value: unknown): value is LogicalDayKey {
  if (!isString(value)) return false
  const match = LOGICAL_DAY_PATTERN.exec(value)
  if (match === null) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
}

function isTimeZone(value: unknown): value is string {
  if (!isNonemptyString(value)) return false
  const cached = validTimeZones.get(value)
  if (cached !== undefined) return cached
  let valid = true
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format(0)
  } catch {
    valid = false
  }
  validTimeZones.set(value, valid)
  return valid
}

function isIntegerAtLeast(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum
}

function hasStrings(value: UnknownRecord, keys: readonly string[]): boolean {
  return keys.every((key) => isNonemptyString(value[key]))
}

function hasEventStamp(value: UnknownRecord): boolean {
  return isInstant(value.at)
    && isLogicalDayKey(value.logicalDay)
    && isTimeZone(value.tz)
}

function isPuffSession(value: unknown): value is PuffSession {
  return isRecord(value)
    && hasStrings(value, ['id'])
    && hasEventStamp(value)
    && isInstant(value.lastTapAt)
    && Date.parse(value.lastTapAt) >= Date.parse(value.at as string)
    && isIntegerAtLeast(value.count, 1)
}

function isResistedUrge(value: unknown): value is ResistedUrge {
  return isRecord(value) && hasStrings(value, ['id']) && hasEventStamp(value)
}

function isClearDay(value: unknown): value is ClearDay {
  return isRecord(value) && hasEventStamp(value)
}

function isRatchetStep(value: unknown): value is RatchetStep {
  return isRecord(value)
    && hasStrings(value, ['id'])
    && isLogicalDayKey(value.effectiveFrom)
    && isInstant(value.at)
    && isIntegerAtLeast(value.target, 0)
    && (value.kind === 'earned' || value.kind === 'declared')
}

function isExportRecord(value: unknown): value is ExportRecord {
  return isRecord(value)
    && hasStrings(value, ['id'])
    && isInstant(value.at)
    && isLogicalDayKey(value.logicalDay)
    && (value.restoredFrom === undefined || isNonemptyString(value.restoredFrom))
}

function validatedArray<Item>(value: unknown, guard: (item: unknown) => item is Item): Item[] {
  if (!Array.isArray(value) || !value.every(guard)) invalidBackup()
  return value
}

function hasUniqueValues<Item>(items: readonly Item[], valueOf: (item: Item) => string): boolean {
  return new Set(items.map(valueOf)).size === items.length
}

function migrateToCurrentFormat(value: unknown): UnknownRecord {
  if (!isRecord(value) || !isIntegerAtLeast(value.formatVersion, 0)) invalidBackup()
  if (value.formatVersion > FORMAT_VERSION) throw new BackupFileError(NEWER_BACKUP_MESSAGE)

  let envelope = value
  while (envelope.formatVersion !== FORMAT_VERSION) {
    const migration = FORMAT_MIGRATIONS[envelope.formatVersion as number]
    if (migration === undefined) invalidBackup()
    envelope = migration(envelope)
  }
  return envelope
}

function validateSummary(
  summary: unknown,
  record: BackupRecord,
): void {
  if (!isRecord(summary)) invalidBackup()
  const counts = {
    puffSessions: record.puffSessions.length,
    resistedUrges: record.resistedUrges.length,
    clearDays: record.clearDays.length,
    ratchetSteps: record.ratchetSteps.length,
  }
  const bounds = logicalDayBounds(record)
  if (
    !Object.entries(counts).every(([key, count]) => summary[key] === count)
    || summary.firstLogicalDay !== bounds.firstLogicalDay
    || summary.lastLogicalDay !== bounds.lastLogicalDay
    || summary.currentTarget !== currentTarget(record.ratchetSteps)
  ) invalidBackup()
}

export function parseBackupFile(text: string): ParsedBackupFile {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    invalidBackup()
  }

  const envelope = migrateToCurrentFormat(parsed)
  if (
    !isIntegerAtLeast(envelope.schemaVersion, 0)
    || !isRecord(envelope.appBuild)
    || !hasStrings(envelope.appBuild, ['sha', 'builtAt'])
    || !isInstant(envelope.appBuild.builtAt)
    || !isInstant(envelope.exportedAt)
    || !isNonemptyString(envelope.installId)
  ) invalidBackup()

  const record: BackupRecord = {
    puffSessions: validatedArray(envelope.puffSessions, isPuffSession),
    resistedUrges: validatedArray(envelope.resistedUrges, isResistedUrge),
    clearDays: validatedArray(envelope.clearDays, isClearDay),
    ratchetSteps: validatedArray(envelope.ratchetSteps, isRatchetStep),
    exports: validatedArray(envelope.exports, isExportRecord),
  }
  validateSummary(envelope.summary, record)

  if (
    !hasUniqueValues(record.puffSessions, (item) => item.id)
    || !hasUniqueValues(record.resistedUrges, (item) => item.id)
    || !hasUniqueValues(record.clearDays, (item) => item.logicalDay)
    || !hasUniqueValues(record.ratchetSteps, (item) => item.id)
    || !hasUniqueValues(record.ratchetSteps, (item) => item.effectiveFrom)
    || !hasUniqueValues(record.exports, (item) => item.id)
  ) invalidBackup()

  const logicalDaysWithPuffSessions = new Set(
    record.puffSessions.map((session) => session.logicalDay),
  )
  return {
    installId: envelope.installId,
    record: {
      ...record,
      clearDays: record.clearDays.filter(
        (clearDay) => !logicalDaysWithPuffSessions.has(clearDay.logicalDay),
      ),
    },
  }
}

function logicalDayBounds(record: BackupRecord): {
  firstLogicalDay: LogicalDayKey | null
  lastLogicalDay: LogicalDayKey | null
} {
  const logicalDays = [
    ...record.puffSessions.map((item) => item.logicalDay),
    ...record.resistedUrges.map((item) => item.logicalDay),
    ...record.clearDays.map((item) => item.logicalDay),
    ...record.ratchetSteps.map((item) => item.effectiveFrom),
    ...record.exports.map((item) => item.logicalDay),
  ].sort()

  return {
    firstLogicalDay: logicalDays.at(0) ?? null,
    lastLogicalDay: logicalDays.at(-1) ?? null,
  }
}

function currentTarget(ratchetSteps: readonly RatchetStep[]): number | null {
  return ratchetSteps.reduce<RatchetStep | undefined>(
    (latest, step) =>
      latest === undefined || step.effectiveFrom > latest.effectiveFrom ? step : latest,
    undefined,
  )?.target ?? null
}

export function createBackupFile(
  record: BackupRecord,
  context: BackupFileContext,
): CreatedBackupFile {
  const bounds = logicalDayBounds(record)
  const puffSessions = record.puffSessions.map((item) => ({
    id: item.id,
    at: item.at,
    lastTapAt: item.lastTapAt,
    count: item.count,
    logicalDay: item.logicalDay,
    tz: item.tz,
  }))
  const resistedUrges = record.resistedUrges.map((item) => ({
    id: item.id,
    at: item.at,
    logicalDay: item.logicalDay,
    tz: item.tz,
  }))
  const clearDays = record.clearDays.map((item) => ({
    logicalDay: item.logicalDay,
    at: item.at,
    tz: item.tz,
  }))
  const ratchetSteps = record.ratchetSteps.map((item) => ({
    id: item.id,
    effectiveFrom: item.effectiveFrom,
    target: item.target,
    kind: item.kind,
    at: item.at,
  }))
  const exports = record.exports.map((item) => ({
    id: item.id,
    at: item.at,
    logicalDay: item.logicalDay,
    ...(item.restoredFrom === undefined ? {} : { restoredFrom: item.restoredFrom }),
  }))
  const envelope = {
    formatVersion: FORMAT_VERSION,
    schemaVersion: context.schemaVersion,
    appBuild: {
      sha: context.appBuild.sha,
      builtAt: context.appBuild.builtAt,
    },
    exportedAt: context.exportedAt,
    installId: context.installId,
    summary: {
      puffSessions: record.puffSessions.length,
      resistedUrges: record.resistedUrges.length,
      clearDays: record.clearDays.length,
      ratchetSteps: record.ratchetSteps.length,
      ...bounds,
      currentTarget: currentTarget(record.ratchetSteps),
    },
    puffSessions,
    resistedUrges,
    clearDays,
    ratchetSteps,
    exports,
  }
  const text = `${JSON.stringify(envelope, null, 2)}\n`
  const name = `vape-off-${context.exportedAt.slice(0, 10)}.json`
  const type = 'application/json' as const

  return {
    file: new File([text], name, { type }),
    name,
    text,
    type,
  }
}
