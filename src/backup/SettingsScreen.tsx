import { useEffect, useState, useTransition } from 'react'
import {
  knownLogicalDayCount,
  type BackupSource,
  type LoadedBackupRecord,
  type PreparedRestore,
} from './browser-backup-source.ts'
import { BackupFileError } from './backup-file.ts'

export function SettingsScreen({
  source,
  installed,
}: {
  source: BackupSource
  installed: boolean
}) {
  const [record, setRecord] = useState<LoadedBackupRecord>()
  const [loadError, setLoadError] = useState(false)
  const [backingUp, startBackup] = useTransition()
  const [restoring, startRestore] = useTransition()
  const [message, setMessage] = useState<string>()
  const [backupError, setBackupError] = useState(false)
  const [restoreError, setRestoreError] = useState<string>()
  const [pendingRestore, setPendingRestore] = useState<PreparedRestore>()

  useEffect(() => {
    if (!installed) return
    let alive = true
    source.load().then(
      (loaded) => {
        if (alive) setRecord(loaded)
      },
      () => {
        if (alive) setLoadError(true)
      },
    )
    return () => {
      alive = false
    }
  }, [installed, source])

  async function backUp() {
    if (!record || backingUp) return
    setMessage(undefined)
    setBackupError(false)
    try {
      const result = await source.backUp(record)
      setMessage(
        result.handoff === 'shared'
          ? `${result.fileName} was handed to the share sheet.`
          : `${result.fileName} download started.`,
      )
      setRecord(await source.load())
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === 'AbortError')) setBackupError(true)
    }
  }

  async function restore(candidate: PreparedRestore) {
    if (restoring) return
    setMessage(undefined)
    setRestoreError(undefined)
    try {
      await source.restore(candidate)
      setPendingRestore(undefined)
      setMessage('Backup restored.')
      setRecord(await source.load())
    } catch (reason) {
      setRestoreError(
        reason instanceof BackupFileError
          ? reason.message
          : 'The Backup could not be restored.',
      )
    }
  }

  async function selectRestore(file: File) {
    setMessage(undefined)
    setRestoreError(undefined)
    try {
      const candidate = await source.prepareRestore(file)
      if (record && knownLogicalDayCount(record) > 0) {
        setPendingRestore(candidate)
      } else {
        startRestore(() => restore(candidate))
      }
    } catch (reason) {
      setRestoreError(
        reason instanceof BackupFileError
          ? reason.message
          : 'This is not a valid vape-off backup.',
      )
    }
  }

  return (
    <main className="settings-screen">
      <header className="settings-header">
        <p>On this device</p>
        <h1>Settings</h1>
      </header>

      <section className="settings-section" aria-labelledby="backup-heading">
        <h2 id="backup-heading">Backup</h2>
        {!installed ? (
          <p>Install vape-off to back up or restore your record.</p>
        ) : loadError ? (
          <p role="alert">Your record could not be read for Backup.</p>
        ) : record ? (
          <>
            <button type="button" disabled={backingUp || restoring} onClick={() => startBackup(backUp)}>
              Back up now
            </button>
            <label className="restore-picker">
              Restore from a backup
              <input
                type="file"
                accept="application/json,.json"
                disabled={backingUp || restoring}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0]
                  event.currentTarget.value = ''
                  if (file) void selectRestore(file)
                }}
              />
            </label>
          </>
        ) : (
          <p>Reading your record…</p>
        )}
        {message ? <p className="settings-status" aria-live="polite">{message}</p> : null}
        {backupError ? <p role="alert">The Backup could not be handed off.</p> : null}
        {restoreError ? <p role="alert">{restoreError}</p> : null}
      </section>

      {pendingRestore && record ? (
        <div className="restore-dialog" role="dialog" aria-modal="true" aria-labelledby="restore-title">
          <h2 id="restore-title">Replace this record?</h2>
          <p>
            Replace {knownLogicalDayCount(record)} Logical Days with the{' '}
            {pendingRestore.logicalDayCount} in this backup?
          </p>
          <div>
            <button type="button" disabled={restoring} onClick={() => setPendingRestore(undefined)}>
              Keep this record
            </button>
            <button
              type="button"
              disabled={restoring}
              onClick={() => startRestore(() => restore(pendingRestore))}
            >
              Replace record
            </button>
          </div>
        </div>
      ) : null}
    </main>
  )
}
