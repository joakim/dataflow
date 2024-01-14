# Dataflow

- Efficient async dataflow processing
- Simple API
- 365 LOC
- No dependencies

Based on [tiny-reactive-dataflow](https://github.com/lukehutch/tiny-reactive-dataflow), which was inspired by [topologica](https://github.com/datavis-tech/topologica). For now, see [tiny-reactive-dataflow](https://github.com/lukehutch/tiny-reactive-dataflow) for a thorough explanation on how it works.

This is a work in progress. Roadmap:

- [ ] Tests
- [ ] Benchmarks
- [ ] Documentation file
- [ ] Support redefinition of functions?


## Examples

### Create dataflow

```ts
const dataflow = new Dataflow({ out: (x, y) => x + y })
```

```ts
const dataflow = new Dataflow()
dataflow.define({ out: (x, y) => x + y })
```

`define` is the same as `register` in [tiny-reactive-dataflow](https://github.com/lukehutch/tiny-reactive-dataflow).

### Set values

```ts
await dataflow.set({ x: 1, y: 2 })
```

### Get values

```ts
await dataflow.get('out') // 3
```

To access all resulting values:

```ts
dataflow.values // { x: 1, y: 2, out: 3 }
```
