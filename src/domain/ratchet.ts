import type { LogicalDayKey, RatchetStep } from '../store/records.ts'
import {
  baselineAverage,
  completedDays,
  isMet,
  type DayLedgerRecord,
} from './day-ledger.ts'
import { stepLog } from './step-log.ts'

/**
 * The Ratchet: everything that decides whether the Target moves, and to what.
 *
 * The decision is a function of the record and the Logical Day it is being made
 * on, and of nothing else — no clock, no identity, no connection. What the
 * Ratchet returns is an intent; dating it and giving it an id is the store's
 * business, because a Step is dated the Logical Day it was computed (ADR 0011).
 */

/** Who is asking. The Ratchet's own sweep, or one of the two Declared taps. */
export type StepRequest = 'evaluate' | 'handover' | 'step-back'

export type RefusalReason =
  | 'already-stepped-today'
  | 'handover-unavailable'
  | 'not-at-target-zero'

export type RatchetDecision =
  /** Nothing to do. The Ratchet's usual answer. */
  | { status: 'unchanged' }
  /** Target 1 has been held: the Declared Step out of it is available, unwritten. */
  | { status: 'handover-offered' }
  /** Write this Step, effective the Logical Day it was decided on. */
  | { status: 'step'; target: number; kind: RatchetStep['kind'] }
  /** A tap the Ratchet will not honour, and why. */
  | { status: 'refused'; reason: RefusalReason }

export function nextEarnedTarget(target: number): number {
  return target - Math.max(1, Math.floor(0.1 * target + 0.5))
}

/** The first Target: 90% of the Baseline Average, never below 1. */
function firstTarget(average: number): number {
  return Math.max(1, Math.floor(0.9 * average + 0.5))
}

/**
 * Whether five of the seven most recent completed Logical Days were Met,
 * counting only days strictly after `step` — so each step down has to be earned
 * again at the new Target, and the day a Target changed is never judged by it.
 */
function windowSatisfied(
  record: DayLedgerRecord,
  step: RatchetStep,
  today: LogicalDayKey,
): boolean {
  return (
    completedDays(7, today).filter(
      (logicalDay) => logicalDay > step.effectiveFrom && isMet(record, logicalDay, today),
    ).length >= 5
  )
}

export function decideStep(
  record: DayLedgerRecord,
  today: LogicalDayKey,
  request: StepRequest,
): RatchetDecision {
  const steps = stepLog(record.ratchetSteps)

  // At most one Step per Logical Day (ADR 0009). The Ratchet's sweep simply
  // finds nothing to do; a tap is told why, because a tap expects an answer.
  if (steps.changedOn(today)) {
    return request === 'evaluate'
      ? { status: 'unchanged' }
      : { status: 'refused', reason: 'already-stepped-today' }
  }

  const latest = steps.latest()

  if (request === 'step-back') {
    return steps.targetOn(today) === 0
      ? { status: 'step', target: 1, kind: 'declared' }
      : { status: 'refused', reason: 'not-at-target-zero' }
  }

  const handoverEarned =
    latest !== undefined &&
    steps.targetOn(today) === 1 &&
    windowSatisfied(record, latest, today)

  if (request === 'handover') {
    return handoverEarned
      ? { status: 'step', target: 0, kind: 'declared' }
      : { status: 'refused', reason: 'handover-unavailable' }
  }

  if (latest === undefined) {
    const average = baselineAverage(record, today)
    if (average === undefined) return { status: 'unchanged' }
    return { status: 'step', target: firstTarget(average), kind: 'earned' }
  }

  // Dormant at Target 0, and the last step to zero is not the Ratchet's to
  // write (ADR 0006) — it can only offer it.
  if (latest.target === 0) return { status: 'unchanged' }
  if (latest.target === 1) {
    return handoverEarned ? { status: 'handover-offered' } : { status: 'unchanged' }
  }
  if (!windowSatisfied(record, latest, today)) return { status: 'unchanged' }
  return { status: 'step', target: nextEarnedTarget(latest.target), kind: 'earned' }
}
