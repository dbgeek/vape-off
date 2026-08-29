import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { VapeOffDatabase } from './database.ts'
import type { PuffSession, RatchetStep } from './records.ts'
import { declareHandover, declareStepBack, evaluate } from './ratchet-writes.ts'

const databases: VapeOffDatabase[] = []

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.delete()))
})

function databaseForTest(): VapeOffDatabase {
  const database = new VapeOffDatabase(`ratchet-writes-test-${crypto.randomUUID()}`)
  databases.push(database)
  return database
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

describe('Ratchet writes', () => {
  it('materialises the Baseline Average as an Earned Step dated when evaluated', async () => {
    const db = databaseForTest()
    await db.puffSessions.bulkAdd(
      ['22', '23', '24', '25', '26', '27', '28'].map((day) =>
        puffSession(`2026-08-${day}`, 20),
      ),
    )

    const result = await evaluate(db, {
      now: () => new Date('2026-08-29T06:00:00.000Z'),
      timeZone: () => 'Europe/Stockholm',
      randomUUID: () => '21cdbe01-c9f9-4017-a780-8a4a668a8fa2',
    })

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

  it.each([
    [60, 54],
    [150, 135],
  ])('opens Baseline Average %i at first Target %i', async (average, target) => {
    const db = databaseForTest()
    await db.puffSessions.bulkAdd(
      ['22', '23', '24', '25', '26', '27', '28'].map((day) =>
        puffSession(`2026-08-${day}`, average),
      ),
    )

    await expect(
      evaluate(db, {
        now: () => new Date('2026-08-29T06:00:00.000Z'),
        timeZone: () => 'Europe/Stockholm',
        randomUUID: () => '21cdbe01-c9f9-4017-a780-8a4a668a8fa2',
      }),
    ).resolves.toMatchObject({ status: 'step-written', step: { target } })
  })

  it('writes at most one current Step when a twelve-day backfill satisfies the window', async () => {
    const db = databaseForTest()
    await db.ratchetSteps.add(ratchetStep('2026-08-10', 20))
    await db.puffSessions.bulkAdd(
      Array.from({ length: 12 }, (_, index) =>
        puffSession(`2026-08-${String(index + 11).padStart(2, '0')}`, 20),
      ),
    )
    const environment = {
      now: () => new Date('2026-08-23T06:00:00.000Z'),
      timeZone: () => 'Europe/Stockholm',
      randomUUID: () => '21cdbe01-c9f9-4017-a780-8a4a668a8fa2',
    }

    await expect(evaluate(db, environment)).resolves.toMatchObject({
      status: 'step-written',
      step: { effectiveFrom: '2026-08-23', target: 18, kind: 'earned' },
    })
    await expect(evaluate(db, environment)).resolves.toEqual({ status: 'unchanged' })
    await expect(db.ratchetSteps.orderBy('effectiveFrom').toArray()).resolves.toHaveLength(2)
  })

  it('opens a seven-Clear-Day Baseline at Target 1 rather than Target 0', async () => {
    const db = databaseForTest()
    await db.clearDays.bulkAdd(
      ['22', '23', '24', '25', '26', '27', '28'].map((day) => ({
        logicalDay: `2026-08-${day}`,
        at: `2026-08-${day}T20:00:00.000+02:00`,
        tz: 'Europe/Stockholm',
      })),
    )

    await expect(
      evaluate(db, {
        now: () => new Date('2026-08-29T06:00:00.000Z'),
        timeZone: () => 'Europe/Stockholm',
        randomUUID: () => '21cdbe01-c9f9-4017-a780-8a4a668a8fa2',
      }),
    ).resolves.toMatchObject({ status: 'step-written', step: { target: 1 } })
  })

  it('does not change the Step log after a seven-day absence', async () => {
    const db = databaseForTest()
    const step = ratchetStep('2026-08-20', 10)
    await db.ratchetSteps.add(step)

    await expect(
      evaluate(db, {
        now: () => new Date('2026-08-29T06:00:00.000Z'),
        timeZone: () => 'Europe/Stockholm',
        randomUUID: () => 'unused',
      }),
    ).resolves.toEqual({ status: 'unchanged' })
    await expect(db.ratchetSteps.toArray()).resolves.toEqual([step])
  })

  it('offers the handover after holding Target 1 without writing Target 0', async () => {
    const db = databaseForTest()
    await db.ratchetSteps.add(ratchetStep('2026-08-20', 1))
    await db.puffSessions.bulkAdd(
      ['21', '22', '23', '24', '25'].map((day) => puffSession(`2026-08-${day}`, 1)),
    )

    await expect(
      evaluate(db, {
        now: () => new Date('2026-08-26T06:00:00.000Z'),
        timeZone: () => 'Europe/Stockholm',
        randomUUID: () => 'unused',
      }),
    ).resolves.toEqual({ status: 'handover-offered' })
    await expect(db.ratchetSteps.toArray()).resolves.toHaveLength(1)
  })

  it('appends the accepted handover as a Declared Target 0 Step', async () => {
    const db = databaseForTest()
    await db.ratchetSteps.add(ratchetStep('2026-08-20', 1))
    await db.puffSessions.bulkAdd(
      ['21', '22', '23', '24', '25'].map((day) => puffSession(`2026-08-${day}`, 1)),
    )

    const step = await declareHandover(db, {
      now: () => new Date('2026-08-26T06:00:00.000Z'),
      timeZone: () => 'Europe/Stockholm',
      randomUUID: () => '21cdbe01-c9f9-4017-a780-8a4a668a8fa2',
    })

    expect(step).toMatchObject({
      effectiveFrom: '2026-08-26',
      target: 0,
      kind: 'declared',
    })
    await expect(db.ratchetSteps.orderBy('effectiveFrom').toArray()).resolves.toEqual([
      ratchetStep('2026-08-20', 1),
      step,
    ])
  })

  it('declares the only raise from Target 0 to 1 and wakes the Ratchet', async () => {
    const db = databaseForTest()
    await db.ratchetSteps.add({ ...ratchetStep('2026-08-20', 0), kind: 'declared' })

    await expect(
      evaluate(db, {
        now: () => new Date('2026-08-21T06:00:00.000Z'),
        timeZone: () => 'Europe/Stockholm',
        randomUUID: () => 'unused',
      }),
    ).resolves.toEqual({ status: 'unchanged' })

    const step = await declareStepBack(db, {
      now: () => new Date('2026-08-21T06:00:00.000Z'),
      timeZone: () => 'Europe/Stockholm',
      randomUUID: () => '21cdbe01-c9f9-4017-a780-8a4a668a8fa2',
    })
    expect(step).toMatchObject({
      effectiveFrom: '2026-08-21',
      target: 1,
      kind: 'declared',
    })

    await db.puffSessions.bulkAdd(
      ['22', '23', '24', '25', '26'].map((day) => puffSession(`2026-08-${day}`, 1)),
    )
    await expect(
      evaluate(db, {
        now: () => new Date('2026-08-27T06:00:00.000Z'),
        timeZone: () => 'Europe/Stockholm',
        randomUUID: () => 'unused',
      }),
    ).resolves.toEqual({ status: 'handover-offered' })
  })

  it('refuses a second Declared Step on the same Logical Day', async () => {
    const db = databaseForTest()
    await db.ratchetSteps.add({ ...ratchetStep('2026-08-20', 0), kind: 'declared' })
    const environment = {
      now: () => new Date('2026-08-20T06:00:00.000Z'),
      timeZone: () => 'Europe/Stockholm',
      randomUUID: () => 'unused',
    }

    await expect(declareStepBack(db, environment)).rejects.toThrow(
      'You have already changed your target today',
    )
    await expect(db.ratchetSteps.toArray()).resolves.toHaveLength(1)
  })
})
