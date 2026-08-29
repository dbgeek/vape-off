import { baselineAverage, type DayLedgerRecord } from '../domain/day-ledger.ts'
import { instantOf, logicalDayKeyOf } from '../domain/logical-day.ts'
import { nextEarnedTarget, targetOn, windowSatisfied } from '../domain/ratchet.ts'
import type { VapeOffDatabase } from './database.ts'
import { readRecord } from './read-record.ts'
import type { RatchetStep } from './records.ts'
import type { StoreEnvironment } from './session.ts'

export type EvaluationResult =
  | { status: 'unchanged' }
  | { status: 'handover-offered' }
  | { status: 'step-written'; step: RatchetStep }

export async function evaluate(
  db: VapeOffDatabase,
  environment: StoreEnvironment,
): Promise<EvaluationResult> {
  const now = environment.now()
  const timeZone = environment.timeZone()
  const today = logicalDayKeyOf(now, timeZone)

  return db.transaction(
    'rw',
    db.puffSessions,
    db.resistedUrges,
    db.clearDays,
    db.ratchetSteps,
    async () => {
      const record = await readRecord(db)
      if (record.ratchetSteps.some((step) => step.effectiveFrom === today)) {
        return { status: 'unchanged' }
      }

      let target: number
      if (record.ratchetSteps.length === 0) {
        const average = baselineAverage(record, today)
        if (average === undefined) return { status: 'unchanged' }
        target = Math.max(1, Math.floor(0.9 * average + 0.5))
      } else {
        const latestStep = record.ratchetSteps.reduce((latest, step) =>
          step.effectiveFrom > latest.effectiveFrom ? step : latest,
        )
        if (latestStep.target === 0) return { status: 'unchanged' }
        const satisfied = windowSatisfied(record, latestStep, today)
        if (latestStep.target === 1) {
          return satisfied ? { status: 'handover-offered' } : { status: 'unchanged' }
        }
        if (!satisfied) {
          return { status: 'unchanged' }
        }
        target = nextEarnedTarget(latestStep.target)
      }

      const step: RatchetStep = {
        id: environment.randomUUID(),
        effectiveFrom: today,
        target,
        kind: 'earned',
        at: instantOf(now, timeZone),
      }
      await db.ratchetSteps.add(step)
      return { status: 'step-written', step }
    },
  )
}

export async function declareHandover(
  db: VapeOffDatabase,
  environment: StoreEnvironment,
): Promise<RatchetStep> {
  const now = environment.now()
  const timeZone = environment.timeZone()
  const today = logicalDayKeyOf(now, timeZone)

  return db.transaction(
    'rw',
    db.puffSessions,
    db.resistedUrges,
    db.clearDays,
    db.ratchetSteps,
    async () => {
      const record = await readRecord(db)
      if (record.ratchetSteps.some((step) => step.effectiveFrom === today)) {
        throw new Error('You have already changed your target today')
      }
      const latestStep = record.ratchetSteps.reduce<RatchetStep | undefined>(
        (latest, step) =>
          latest === undefined || step.effectiveFrom > latest.effectiveFrom ? step : latest,
        undefined,
      )
      if (
        targetOn(record, today) !== 1 ||
        latestStep === undefined ||
        !windowSatisfied(record, latestStep, today)
      ) {
        throw new Error('The handover is not available')
      }

      const step: RatchetStep = {
        id: environment.randomUUID(),
        effectiveFrom: today,
        target: 0,
        kind: 'declared',
        at: instantOf(now, timeZone),
      }
      await db.ratchetSteps.add(step)
      return step
    },
  )
}

export async function declareStepBack(
  db: VapeOffDatabase,
  environment: StoreEnvironment,
): Promise<RatchetStep> {
  const now = environment.now()
  const timeZone = environment.timeZone()
  const today = logicalDayKeyOf(now, timeZone)

  return db.transaction('rw', db.ratchetSteps, async () => {
    const ratchetSteps = await db.ratchetSteps.toArray()
    if (ratchetSteps.some((step) => step.effectiveFrom === today)) {
      throw new Error('You have already changed your target today')
    }
    const record: DayLedgerRecord = {
      puffSessions: [],
      resistedUrges: [],
      clearDays: [],
      ratchetSteps,
    }
    if (targetOn(record, today) !== 0) {
      throw new Error('A step back is only available at Target 0')
    }

    const step: RatchetStep = {
      id: environment.randomUUID(),
      effectiveFrom: today,
      target: 1,
      kind: 'declared',
      at: instantOf(now, timeZone),
    }
    await db.ratchetSteps.add(step)
    return step
  })
}
