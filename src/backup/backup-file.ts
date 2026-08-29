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
