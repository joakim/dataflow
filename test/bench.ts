import { Bench } from 'tinybench'
import { Dataflow } from '../src/dataflow'

const bench = new Bench({ time: 1000 })

bench.add('simple', async () => {
  const dataflow = new Dataflow({ out: (x: number, y: number) => x + y })
  await dataflow.set({ x: 1, y: 2 })
  await dataflow.get('out')
})

await bench.run()

console.table(bench.table())
