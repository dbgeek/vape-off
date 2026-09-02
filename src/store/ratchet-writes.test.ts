import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { VapeOffDatabase } from './database.ts'
import type { PuffSession, RatchetStep } from './records.ts'
import { declareHandover, declareStepBack, evaluate } from './ratchet-writes.ts'

/**
 * The Ratchet's rules are decided in `domain/ratchet.ts` and tested there. What
 * is left here is the store's half: that a decision is dated the Logical Day it
 * was made on, appended once, and that a refusal reaches the reader in words.
 */

const databases: VapeOffDatabase[] = []

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.delete()))
})

function databaseForTest(): VapeOffDatabase {
  const database = new VapeOffDatabase(`ratchet-writes-test-${crypto.randomUUID()}`)
  databases.push(database)
  return database
}

function environmentAt(at: string, randomUUID = () => 'unused') {
  return {
    now: () => new Date(at),
    timeZone: () => 'Europe/Stockholm',
    randomUUID,
  }
}

function puffSession(logicalDay: string, count: number): PuffSession {
  return {
    id: `session-${logicalDay}`,
    at: `${logicalDay}T12:00:00.000+02:00`,
    lastTapAt: `${logicalDay}T12:01:00.000+02:00`,
    count,
    logicalDay,
    tz: 'Europe/Stockholm',
  }
}

function ratchetStep(effectiveFrom: string, target: number): RatchetStep {
  return {
    id: `step-${effectiveFrom}`,
    effectiveFrom,
    target,
    kind: 'earned',
    at: `${effectiveFrom}T04:00:00.000+02:00`,
  }
}

/** A closed Baseline of seven Known Logical Days, ready for the first Step. */
async function withBaseline(db: VapeOffDatabase): Promise<void> {
  await db.puffSessions.bulkAdd(
    ['22', '23', '24', '25', '26', '27', '28'].map((day) => puffSession(`2026-08-${day}`, 20)),
  )
}

/** Target 1, held for five Met days — the handover is earned. */
async function withHeldTargetOne(db: VapeOffDatabase): Promise<void> {
  await db.ratchetSteps.add(ratchetStep('2026-08-20', 1))
  await db.puffSessions.bulkAdd(
    ['21', '22', '23', '24', '25'].map((day) => puffSession(`2026-08-${day}`, 1)),
  )
}

describe('Ratchet writes', () => {
  it('dates a decided Step the Logical Day it was evaluated, at the evaluating instant', async () => {
    const db = databaseForTest()
    await withBaseline(db)

    const result = await evaluate(
      db,
      environmentAt('2026-08-29T06:00:00.000Z', () => '21cdbe01-c9f9-4017-a780-8a4a668a8fa2'),
    )

    expect(result).toEqual({
      status: 'step-written',
      step: {
        id: '21cdbe01-c9f9-4017-a780-8a4a668a8fa2',
        effectiveFrom: '2026-08-29',
        target: 18,
        kind: 'earned',
        at: '2026-08-29T08:00:00.000+02:00',
      },
    })
    if (result.status !== 'step-written') throw new Error('Expected an Earned Step')
    await expect(db.ratchetSteps.toArray()).resolves.toEqual([result.step])
  })

  it('appends at most one Step per Logical Day however often it is evaluated', async () => {
    const db = databaseForTest()
    await withBaseline(db)
    const environment = environmentAt('2026-08-29T06:00:00.000Z', () => crypto.randomUUID())

    await expect(evaluate(db, environment)).resolves.toMatchObject({ status: 'step-written' })
    await expect(evaluate(db, environment)).resolves.toEqual({ status: 'unchanged' })
    await expect(db.ratchetSteps.count()).resolves.toBe(1)
  })

  it('writes nothing when the Ratchet offers the handover', async () => {
    const db = databaseForTest()
    await withHeldTargetOne(db)

    await expect(evaluate(db, environmentAt('2026-08-26T06:00:00.000Z'))).resolves.toEqual({
      status: 'handover-offered',
    })
    await expect(db.ratchetSteps.count()).resolves.toBe(1)
  })

  it('appends the accepted handover as a Declared Target 0 Step', async () => {
    const db = databaseForTest()
    await withHeldTargetOne(db)

    const step = await declareHandover(
      db,
      environmentAt('2026-08-26T06:00:00.000Z', () => '21cdbe01-c9f9-4017-a780-8a4a668a8fa2'),
    )

    expect(step).toMatchObject({ effectiveFrom: '2026-08-26', target: 0, kind: 'declared' })
    await expect(db.ratchetSteps.orderBy('effectiveFrom').toArray()).resolves.toEqual([
      ratchetStep('2026-08-20', 1),
      step,
    ])
  })

  it('declares the raise out of Target 0 and wakes the Ratchet', async () => {
    const db = databaseForTest()
    await db.ratchetSteps.add({ ...ratchetStep('2026-08-20', 0), kind: 'declared' })

    const step = await declareStepBack(
      db,
      environmentAt('2026-08-21T06:00:00.000Z', () => '21cdbe01-c9f9-4017-a780-8a4a668a8fa2'),
    )
    expect(step).toMatchObject({ effectiveFrom: '2026-08-21', target: 1, kind: 'declared' })

    await db.puffSessions.bulkAdd(
      ['22', '23', '24', '25', '26'].map((day) => puffSession(`2026-08-${day}`, 1)),
    )
    await expect(evaluate(db, environmentAt('2026-08-27T06:00:00.000Z'))).resolves.toEqual({
      status: 'handover-offered',
    })
  })

  it.each([
    {
      refusal: 'a second Declared Step on the same Logical Day',
      declare: declareStepBack,
      message: 'You have already changed your target today',
      steps: [{ ...ratchetStep('2026-08-20', 0), kind: 'declared' as const }],
      at: '2026-08-20T06:00:00.000Z',
    },
    {
      refusal: 'a handover that has not been earned',
      declare: declareHandover,
      message: 'The handover is not available',
      steps: [ratchetStep('2026-08-20', 1)],
      at: '2026-08-26T06:00:00.000Z',
    },
    {
      refusal: 'a step back above Target 0',
      declare: declareStepBack,
      message: 'A step back is only available at Target 0',
      steps: [ratchetStep('2026-08-20', 1)],
      at: '2026-08-26T06:00:00.000Z',
    },
  ])('refuses $refusal in words, and writes nothing', async ({ declare, message, steps, at }) => {
    const db = databaseForTest()
    await db.ratchetSteps.bulkAdd(steps)

    await expect(declare(db, environmentAt(at))).rejects.toThrow(message)
    await expect(db.ratchetSteps.count()).resolves.toBe(1)
  })

  it('decides the same Step whether or not the Puff Sessions are Kicked', async () => {
    const plain = databaseForTest()
    const kicked = databaseForTest()
    await withBaseline(plain)
    await withBaseline(kicked)
    // The Kick touches no mechanism, so the Ratchet has to be blind to it.
    await kicked.puffSessions.toCollection().modify((session) => {
      session.kickMarkedAt = `${session.logicalDay}T12:05:00.000+02:00`
    })
    const environment = environmentAt('2026-08-29T10:00:00.000+02:00', () => 'decided-step')

    const plainResult = await evaluate(plain, environment)
    const kickedResult = await evaluate(kicked, environment)

    expect(plainResult.status).toBe('step-written')
    expect(kickedResult).toEqual(plainResult)
    await expect(kicked.ratchetSteps.toArray()).resolves.toEqual(
      await plain.ratchetSteps.toArray(),
    )
  })
})
