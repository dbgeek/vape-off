import { describe, expect, it } from 'vitest'
import type { RatchetStep } from '../store/records.ts'
import { stepLog } from './step-log.ts'

function ratchetStep(effectiveFrom: string, target: number): RatchetStep {
  return {
    id: `step-${effectiveFrom}`,
    effectiveFrom,
    target,
    kind: 'earned',
    at: `${effectiveFrom}T04:00:00.000+02:00`,
  }
}

describe('the Ratchet Step log', () => {
  it('reads the Target in force on a Logical Day regardless of the order it was given', () => {
    const log = stepLog([ratchetStep('2026-08-20', 18), ratchetStep('2026-08-14', 20)])

    expect(log.targetOn('2026-08-13')).toBeUndefined()
    expect(log.targetOn('2026-08-14')).toBe(20)
    expect(log.targetOn('2026-08-18')).toBe(20)
    expect(log.targetOn('2026-08-25')).toBe(18)
  })

  it('has no Target in force over an empty log', () => {
    const log = stepLog([])

    expect(log.targetOn('2026-08-25')).toBeUndefined()
    expect(log.latest()).toBeUndefined()
    expect(log.changedOn('2026-08-25')).toBe(false)
  })

  it('takes the latest Step by the Logical Day it takes effect, not by position', () => {
    const log = stepLog([ratchetStep('2026-08-20', 18), ratchetStep('2026-08-14', 20)])

    expect(log.latest()).toMatchObject({ effectiveFrom: '2026-08-20', target: 18 })
  })

  it('holds a Target that a later Step has not yet reached, and answers for the Step ahead', () => {
    // A Step dated ahead of today is reachable through a Backup written on a
    // device further east. It is the latest Step, but it is not in force yet.
    const log = stepLog([ratchetStep('2026-08-20', 18), ratchetStep('2026-08-30', 16)])

    expect(log.targetOn('2026-08-25')).toBe(18)
    expect(log.latest()).toMatchObject({ effectiveFrom: '2026-08-30' })
  })

  it('knows which Logical Days already carry a Step', () => {
    const log = stepLog([ratchetStep('2026-08-20', 18)])

    expect(log.changedOn('2026-08-20')).toBe(true)
    expect(log.changedOn('2026-08-21')).toBe(false)
  })
})
