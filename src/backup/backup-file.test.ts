import { describe, expect, it } from 'vitest'
import type { BackupRecord } from './backup-file.ts'
import {
  BackupFileError,
  createBackupFile,
  FORMAT_VERSION,
  parseBackupFile,
} from './backup-file.ts'

const record: BackupRecord = {
  puffSessions: [
    {
      id: 'session',
      at: '2026-08-20T10:00:00.000+02:00',
      lastTapAt: '2026-08-20T10:01:00.000+02:00',
      count: 3,
      logicalDay: '2026-08-20',
      tz: 'Europe/Stockholm',
    },
  ],
  resistedUrges: [
    {
      id: 'urge',
      at: '2026-08-21T11:00:00.000+02:00',
      logicalDay: '2026-08-21',
      tz: 'Europe/Stockholm',
    },
  ],
  clearDays: [
    {
      logicalDay: '2026-08-22',
      at: '2026-08-22T20:00:00.000+02:00',
      tz: 'Europe/Stockholm',
    },
  ],
  ratchetSteps: [
    {
      id: 'step',
      effectiveFrom: '2026-08-23',
      target: 18,
      kind: 'earned',
      at: '2026-08-23T04:00:00.000+02:00',
    },
  ],
  exports: [
    {
      id: 'previous-backup',
      at: '2026-08-24T12:00:00.000+02:00',
      logicalDay: '2026-08-24',
    },
  ],
}

describe('Backup file', () => {
  it('serialises the complete non-derived record in stable, pretty-printed order', () => {
    const backup = createBackupFile(record, {
      appBuild: { sha: 'abc1234', builtAt: '2026-08-29T08:00:00.000Z' },
      exportedAt: '2026-08-29T12:34:56.789+02:00',
      installId: 'install-id',
      schemaVersion: 1,
    })

    expect(FORMAT_VERSION).toBe(1)
    expect(backup.name).toBe('vape-off-2026-08-29.json')
    expect(backup.type).toBe('application/json')
    expect(backup.text).toBe(`${JSON.stringify({
      formatVersion: 1,
      schemaVersion: 1,
      appBuild: { sha: 'abc1234', builtAt: '2026-08-29T08:00:00.000Z' },
      exportedAt: '2026-08-29T12:34:56.789+02:00',
      installId: 'install-id',
      summary: {
        puffSessions: 1,
        resistedUrges: 1,
        clearDays: 1,
        ratchetSteps: 1,
        firstLogicalDay: '2026-08-20',
        lastLogicalDay: '2026-08-24',
        currentTarget: 18,
      },
      puffSessions: record.puffSessions,
      resistedUrges: record.resistedUrges,
      clearDays: record.clearDays,
      ratchetSteps: record.ratchetSteps,
      exports: record.exports,
    }, null, 2)}\n`)
    expect(JSON.parse(backup.text)).not.toHaveProperty('meta')
  })

  it('uses null summary bounds and Target for an empty Baseline record', () => {
    const empty: BackupRecord = {
      puffSessions: [],
      resistedUrges: [],
      clearDays: [],
      ratchetSteps: [],
      exports: [],
    }
    const backup = createBackupFile(empty, {
      appBuild: { sha: 'abc1234', builtAt: '2026-08-29T08:00:00.000Z' },
      exportedAt: '2026-08-29T12:34:56.789+02:00',
      installId: 'install-id',
      schemaVersion: 1,
    })

    expect(JSON.parse(backup.text).summary).toMatchObject({
      firstLogicalDay: null,
      lastLogicalDay: null,
      currentTarget: null,
    })
  })

  it('validates a complete current-format Backup without treating schemaVersion as a gate', () => {
    const backup = createBackupFile(record, {
      appBuild: { sha: 'abc1234', builtAt: '2026-08-29T08:00:00.000Z' },
      exportedAt: '2026-08-29T12:34:56.789+02:00',
      installId: 'install-id',
      schemaVersion: 999,
    })

    expect(parseBackupFile(backup.text)).toEqual({
      installId: 'install-id',
      record,
    })
  })

  it('refuses a newer format whole', () => {
    const backup = createBackupFile(record, {
      appBuild: { sha: 'abc1234', builtAt: '2026-08-29T08:00:00.000Z' },
      exportedAt: '2026-08-29T12:34:56.789+02:00',
      installId: 'install-id',
      schemaVersion: 1,
    })
    const envelope = JSON.parse(backup.text)
    envelope.formatVersion = FORMAT_VERSION + 1

    expect(() => parseBackupFile(JSON.stringify(envelope))).toThrow(
      new BackupFileError('This backup was made by a newer version of vape-off.'),
    )
  })

  it('repairs a Clear Day that contains a Puff Session', () => {
    const conflictingRecord: BackupRecord = {
      ...record,
      clearDays: [
        ...record.clearDays,
        {
          logicalDay: '2026-08-20',
          at: '2026-08-20T20:00:00.000+02:00',
          tz: 'Europe/Stockholm',
        },
      ],
    }
    const backup = createBackupFile(conflictingRecord, {
      appBuild: { sha: 'abc1234', builtAt: '2026-08-29T08:00:00.000Z' },
      exportedAt: '2026-08-29T12:34:56.789+02:00',
      installId: 'install-id',
      schemaVersion: 1,
    })

    expect(parseBackupFile(backup.text).record.clearDays).toEqual(record.clearDays)
  })

  it('rejects a structurally incomplete file instead of partially reading it', () => {
    const backup = createBackupFile(record, {
      appBuild: { sha: 'abc1234', builtAt: '2026-08-29T08:00:00.000Z' },
      exportedAt: '2026-08-29T12:34:56.789+02:00',
      installId: 'install-id',
      schemaVersion: 1,
    })
    const envelope = JSON.parse(backup.text)
    delete envelope.resistedUrges

    expect(() => parseBackupFile(JSON.stringify(envelope))).toThrow(
      new BackupFileError('This is not a valid vape-off backup.'),
    )
  })

  it('restores a Backup whose non-authoritative summary has gone stale', () => {
    const backup = createBackupFile(record, {
      appBuild: { sha: 'abc1234', builtAt: '2026-08-29T08:00:00.000Z' },
      exportedAt: '2026-08-29T12:34:56.789+02:00',
      installId: 'install-id',
      schemaVersion: 1,
    })
    const envelope = JSON.parse(backup.text)
    envelope.summary.firstLogicalDay = '2020-01-01'
    envelope.summary.lastLogicalDay = '2020-01-02'
    envelope.summary.currentTarget = 99

    expect(parseBackupFile(JSON.stringify(envelope))).toEqual({
      installId: 'install-id',
      record,
    })
  })

  it('refuses a file holding fewer records than its summary counted', () => {
    const backup = createBackupFile(record, {
      appBuild: { sha: 'abc1234', builtAt: '2026-08-29T08:00:00.000Z' },
      exportedAt: '2026-08-29T12:34:56.789+02:00',
      installId: 'install-id',
      schemaVersion: 1,
    })
    const envelope = JSON.parse(backup.text)
    envelope.summary.puffSessions = envelope.puffSessions.length + 1

    expect(() => parseBackupFile(JSON.stringify(envelope))).toThrow(
      new BackupFileError('This is not a valid vape-off backup.'),
    )
  })

  it.each([
    ['an invalid Instant', (envelope: Record<string, any>) => {
      envelope.puffSessions[0].at = 'yesterday'
    }],
    ['an invalid Logical Day key', (envelope: Record<string, any>) => {
      envelope.puffSessions[0].logicalDay = '2026-02-30'
    }],
    ['an invalid time zone', (envelope: Record<string, any>) => {
      envelope.puffSessions[0].tz = 'Somewhere/Imaginary'
    }],
  ])('rejects %s before it reaches storage', (_description, corrupt) => {
    const backup = createBackupFile(record, {
      appBuild: { sha: 'abc1234', builtAt: '2026-08-29T08:00:00.000Z' },
      exportedAt: '2026-08-29T12:34:56.789+02:00',
      installId: 'install-id',
      schemaVersion: 1,
    })
    const envelope = JSON.parse(backup.text)
    corrupt(envelope)

    expect(() => parseBackupFile(JSON.stringify(envelope))).toThrow(
      new BackupFileError('This is not a valid vape-off backup.'),
    )
  })
})
