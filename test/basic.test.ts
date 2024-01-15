import { test, expect, expectTypeOf } from 'vitest'
import { Dataflow } from '../src/dataflow'

const debug = false

test('interface', () => {
  const dataflow = new Dataflow()
  expectTypeOf(dataflow.define).toBeFunction()
  expectTypeOf(dataflow.set).toBeFunction()
  expectTypeOf(dataflow.get).toBeFunction()
  expectTypeOf(dataflow.values).toBeObject()
  expectTypeOf(dataflow.errors).toBeArray()
})

test('basic', async () => {
  const dataflow = new Dataflow({ out: (x: number, y: number) => x + y }, debug)

  await dataflow.set({ x: 1, y: 2 })
  expect(dataflow.values).toStrictEqual({ x: 1, y: 2, out: 3 })

  const out = await dataflow.get('out')
  expect(out).toStrictEqual(3)
})

test('compel', async () => {
  const compel = new Dataflow(
    {
      out: (a, e, d) => (a - e) / d,
      e: (a, b, c) => a * b - c,
      d: (a, b) => a - b,
    },
    debug
  )

  await compel.set({ a: 6, b: 7, c: 8 })

  const out = await compel.get('out')
  expect(out).toStrictEqual(28)
})
