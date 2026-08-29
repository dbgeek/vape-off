import { useEffect, useState, useTransition } from 'react'
import type { BackupSource, LoadedBackupRecord } from './browser-backup-source.ts'

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
  const [message, setMessage] = useState<string>()
  const [backupError, setBackupError] = useState(false)

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
          <button type="button" disabled={backingUp} onClick={() => startBackup(backUp)}>
            Back up now
          </button>
        ) : (
          <p>Reading your record…</p>
        )}
        {message ? <p className="settings-status" aria-live="polite">{message}</p> : null}
        {backupError ? <p role="alert">The Backup could not be handed off.</p> : null}
      </section>
    </main>
  )
}
