import type { LogicalDayKey, RatchetStep } from '../store/records.ts'

/**
 * The Ratchet Step log, read from the Steps alone.
 *
 * The Target in force on any Logical Day is the most recent Step at or before
 * it (ADR 0011), and at most one Step may take effect on a Logical Day (ADR
 * 0009). Every question of that shape is answered here, so a caller holding
 * nothing but Steps never has to assemble a record it does not have.
 */
export interface StepLog {
  /** The Target in force on `logicalDay`, or undefined during the Baseline. */
  targetOn: (logicalDay: LogicalDayKey) => number | undefined
  /** The most recent Step, whatever Logical Day it takes effect from. */
  latest: () => RatchetStep | undefined
  /** Whether a Step already takes effect on `logicalDay`. */
  changedOn: (logicalDay: LogicalDayKey) => boolean
}

export function stepLog(steps: readonly RatchetStep[]): StepLog {
  const ordered = [...steps].sort((left, right) =>
    left.effectiveFrom.localeCompare(right.effectiveFrom),
  )

  return {
    targetOn(logicalDay) {
      let target: number | undefined
      for (const step of ordered) {
        if (step.effectiveFrom > logicalDay) break
        target = step.target
      }
      return target
    },

    latest: () => ordered.at(-1),

    changedOn: (logicalDay) => ordered.some((step) => step.effectiveFrom === logicalDay),
  }
}
