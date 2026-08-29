export interface BackupShareNavigator {
  canShare?: (data?: ShareData) => boolean
  share?: (data?: ShareData) => Promise<void>
}

export interface BackupAnchor {
  href: string
  download: string
  click: () => void
  remove: () => void
}

export interface BackupHandoffEnvironment {
  navigator: BackupShareNavigator
  createObjectURL: (object: Blob) => string
  revokeObjectURL: (url: string) => void
  createAnchor: () => BackupAnchor
  appendAnchor: (anchor: BackupAnchor) => void
  schedule: (callback: () => void, delay: number) => void
}

const browserEnvironment: BackupHandoffEnvironment = {
  navigator,
  createObjectURL: (object) => URL.createObjectURL(object),
  revokeObjectURL: (url) => URL.revokeObjectURL(url),
  createAnchor: () => document.createElement('a'),
  appendAnchor: (anchor) => document.body.append(anchor as HTMLAnchorElement),
  schedule: (callback, delay) => window.setTimeout(callback, delay),
}

export type BackupHandoff = 'shared' | 'downloaded'

export async function handOffBackup(
  file: File,
  environment: BackupHandoffEnvironment = browserEnvironment,
): Promise<BackupHandoff> {
  const shareData: ShareData = {
    files: [file],
    title: 'vape-off Backup',
    text: 'A Backup of your vape-off record.',
  }

  if (
    environment.navigator.share !== undefined &&
    environment.navigator.canShare?.(shareData) === true
  ) {
    await environment.navigator.share(shareData)
    return 'shared'
  }

  const url = environment.createObjectURL(file)
  const anchor = environment.createAnchor()
  anchor.href = url
  anchor.download = file.name
  environment.appendAnchor(anchor)
  anchor.click()
  anchor.remove()
  environment.schedule(() => environment.revokeObjectURL(url), 30_000)
  return 'downloaded'
}
