import { instantOf, logicalDayKeyOf } from '../domain/logical-day.ts'
import {
  decideStep,
  type RatchetDecision,
  type RefusalReason,
  type StepRequest,
} from '../domain/ratchet.ts'
import type { VapeOffDatabase } from './database.ts'
import { readRecord } from './read-record.ts'
import type { RatchetStep } from './records.ts'
import type { StoreEnvironment } from './session.ts'

/**
 * The Ratchet's writes: the decision is the Ratchet's, and everything here is
 * the store's half of it — reading the record the decision is made against,
 * dating the Step, and appending it. The transaction is what makes "no Step yet
 * today" still true at the moment the Step lands; `&effectiveFrom` is the
 * backstop behind it (ADR 0011).
 */

export type EvaluationResult =
  | { status: 'unchanged' }
  | { status: 'handover-offered' }
  | { status: 'step-written'; step: RatchetStep }

/** A refused tap is answered in words, because Stats shows the reader this sentence. */
const REFUSALS: Record<RefusalReason, string> = {
  'already-stepped-today': 'You have already changed your target today',
  'handover-unavailable': 'The handover is not available',
  'not-at-target-zero': 'A step back is only available at Target 0',
}

interface WrittenDecision {
  decision: RatchetDecision
  step: RatchetStep | undefined
}

async function decideAndWrite(
  db: VapeOffDatabase,
  environment: StoreEnvironment,
  request: StepRequest,
): Promise<WrittenDecision> {
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
      const decision = decideStep(record, today, request)
      if (decision.status !== 'step') return { decision, step: undefined }

      const step: RatchetStep = {
        id: environment.randomUUID(),
        effectiveFrom: today,
        target: decision.target,
        kind: decision.kind,
        at: instantOf(now, timeZone),
      }
      await db.ratchetSteps.add(step)
      return { decision, step }
    },
  )
}

function refuse(decision: RatchetDecision): never {
  throw new Error(
    decision.status === 'refused'
      ? REFUSALS[decision.reason]
      : 'The Target could not be changed',
  )
}

export async function evaluate(
  db: VapeOffDatabase,
  environment: StoreEnvironment,
): Promise<EvaluationResult> {
  const { decision, step } = await decideAndWrite(db, environment, 'evaluate')
  if (step !== undefined) return { status: 'step-written', step }
  if (decision.status === 'handover-offered') return { status: 'handover-offered' }
  return { status: 'unchanged' }
}

export async function declareHandover(
  db: VapeOffDatabase,
  environment: StoreEnvironment,
): Promise<RatchetStep> {
  const { decision, step } = await decideAndWrite(db, environment, 'handover')
  return step ?? refuse(decision)
}

export async function declareStepBack(
  db: VapeOffDatabase,
  environment: StoreEnvironment,
): Promise<RatchetStep> {
  const { decision, step } = await decideAndWrite(db, environment, 'step-back')
  return step ?? refuse(decision)
}
