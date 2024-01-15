# Dataflow

- Efficient async dataflow
- Simple API
- 4 KB minified (1.5 KB gzipped)
- No dependencies

Based on [tiny-reactive-dataflow](https://github.com/lukehutch/tiny-reactive-dataflow), which was inspired by [topologica](https://github.com/datavis-tech/topologica). For now, see [tiny-reactive-dataflow](https://github.com/lukehutch/tiny-reactive-dataflow) for a thorough explanation on how it works.

#### Roadmap

- [ ] Tests
- [ ] Benchmarks
- [ ] Documentation
- [ ] Support redefinition of functions?
- [ ] Add back [helpers for DOM binding](https://github.com/lukehutch/tiny-reactive-dataflow#connecting-dataflow-to-the-html-dom)? (Skipped for now, to focus on core functionality.)

## Installation

Use your package manager of choice:

```sh
npm install @joakimstai/dataflow
```

```sh
pnpm add @joakimstai/dataflow
```

## Usage

#### Importing

Import using the appropriate method for your environment:

```js
import { Dataflow } from '@joakimstai/dataflow'
```

```js
const { Dataflow } = require('@joakimstai/dataflow')
```

#### Create a dataflow

```ts
const dataflow = new Dataflow()
```

Alternatively, define functions up front:

```ts
const dataflow = new Dataflow({ out: (x, y) => x + y })
```

#### Define functions

```ts
dataflow.define({ out: (x, y) => x + y })
```

#### Set values

```ts
await dataflow.set({ x: 1, y: 2 })
```

#### Get values

```ts
await dataflow.get('out') // 3
```

To access all resulting values:

```ts
dataflow.values // { x: 1, y: 2, out: 3 }
```
