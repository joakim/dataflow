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
  expect(dataflow.values).toStrictEqual({})

  await dataflow.set({ x: 1, y: 2 })
  expect(dataflow.values).toStrictEqual({ x: 1, y: 2, out: 3 })

  const out = await dataflow.get('out')
  expect(out).toStrictEqual(3)
})
