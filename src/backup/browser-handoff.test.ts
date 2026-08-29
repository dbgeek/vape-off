import { describe, expect, it, vi } from 'vitest'
import { handOffBackup, type BackupHandoffEnvironment } from './browser-handoff.ts'

function largeBackup(): File {
  return new File(['x'.repeat(2_500_000)], 'vape-off-2026-08-29.json', {
    type: 'application/json',
  })
}

describe('Backup browser hand-off', () => {
  it('passes a 2.5 MB file to the share sheet synchronously when canShare permits it', async () => {
    const file = largeBackup()
    const share = vi.fn().mockResolvedValue(undefined)
    const canShare = vi.fn().mockReturnValue(true)
    const environment: BackupHandoffEnvironment = {
      navigator: { canShare, share },
      createObjectURL: vi.fn(),
      revokeObjectURL: vi.fn(),
      createAnchor: vi.fn(),
      appendAnchor: vi.fn(),
      schedule: vi.fn(),
    }

    const handingOff = handOffBackup(file, environment)

    expect(share).toHaveBeenCalledOnce()
    expect(canShare).toHaveBeenCalledWith({
      files: [file],
      title: 'vape-off Backup',
      text: 'A Backup of your vape-off record.',
    })
    expect(share).toHaveBeenCalledWith({
      files: [file],
      title: 'vape-off Backup',
      text: 'A Backup of your vape-off record.',
    })
    await expect(handingOff).resolves.toBe('shared')
  })

  it('downloads the named file when file sharing is unavailable', async () => {
    const file = largeBackup()
    const click = vi.fn()
    const anchor = { href: '', download: '', click, remove: vi.fn() }
    let revoke: (() => void) | undefined
    const environment: BackupHandoffEnvironment = {
      navigator: { canShare: vi.fn().mockReturnValue(false), share: vi.fn() },
      createObjectURL: vi.fn().mockReturnValue('blob:backup'),
      revokeObjectURL: vi.fn(),
      createAnchor: vi.fn().mockReturnValue(anchor),
      appendAnchor: vi.fn(),
      schedule: vi.fn((callback: () => void) => {
        revoke = callback
      }),
    }

    await expect(handOffBackup(file, environment)).resolves.toBe('downloaded')

    expect(anchor.href).toBe('blob:backup')
    expect(anchor.download).toBe('vape-off-2026-08-29.json')
    expect(environment.appendAnchor).toHaveBeenCalledWith(anchor)
    expect(click).toHaveBeenCalledOnce()
    expect(anchor.remove).toHaveBeenCalledOnce()
    expect(environment.schedule).toHaveBeenCalledWith(expect.any(Function), 30_000)
    expect(environment.revokeObjectURL).not.toHaveBeenCalled()
    revoke!()
    expect(environment.revokeObjectURL).toHaveBeenCalledWith('blob:backup')
  })
})
