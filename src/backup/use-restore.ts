import { useState } from 'react'
import type { BackupSource, PreparedRestore } from './browser-backup-source.ts'
import { BackupFileError } from './backup-file.ts'

const noOp = async () => {}

export function useRestore(
  source: BackupSource,
  onRestoreCompleted: () => Promise<void> = noOp,
) {
  const [restoring, setRestoring] = useState(false)
  const [restoreMessage, setRestoreMessage] = useState<string>()
  const [restoreError, setRestoreError] = useState<string>()

  async function prepareRestore(file: File): Promise<PreparedRestore | undefined> {
    setRestoreMessage(undefined)
    setRestoreError(undefined)
    try {
      return await source.prepareRestore(file)
    } catch (reason) {
      setRestoreError(
        reason instanceof BackupFileError
          ? reason.message
          : 'This is not a valid vape-off backup.',
      )
      return undefined
    }
  }

  async function completeRestore(candidate: PreparedRestore): Promise<boolean> {
    if (restoring) return false
    setRestoring(true)
    setRestoreMessage(undefined)
    setRestoreError(undefined)
    try {
      await source.restore(candidate)
      await onRestoreCompleted()
      setRestoreMessage('Backup restored.')
      return true
    } catch (reason) {
      setRestoreError(
        reason instanceof BackupFileError
          ? reason.message
          : 'The Backup could not be restored.',
      )
      return false
    } finally {
      setRestoring(false)
    }
  }

  return {
    completeRestore,
    prepareRestore,
    restoring,
    restoreError,
    restoreMessage,
  }
}
