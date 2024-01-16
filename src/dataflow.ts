/**
 * Dataflow by Joakim Stai
 * └ Based on Luke Hutchison's https://github.com/lukehutch/tiny-reactive-dataflow
 *   └ Inspired by Curran Kelleher's https://github.com/datavis-tech/topologica
 *
 * License: MIT
 */

/** Function node. */
type Fn = (...args: any[]) => unknown // eslint-disable-line
type FnInternal = Fn & { numDirtyDeps: number }

/** An error thrown by a function node during execution of the dataflow. */
type DataflowError = {
  /** The name of the dataflow function node that threw the error. */
  functionName: string
  /** The input parameters to the function call. */
  functionParams: unknown[]
  /** The Error object. */
  reason: Error
}

export class Dataflow {
  /**
   * The resulting values of nodes (cached values during execution of the dataflow).
   *
   * Before reading any values, allow the dataflow change propagation to complete and the graph to
   * settle by calling `set()` with `await`.
   *
   *     await dataflow.set({ x: 40 });
   *     console.log(dataflow.values)
   *
   * See also `get()`.
   */
  public values: { [index: string]: unknown } = {}

  /**
   * Holds any errors thrown by function nodes during execution of the dataflow.
   *
   * You should only read this field after `await`ing the result of a `set()` operation.
   *
   * Note that errors prevent dataflow propagation beyond the node that throws the error.
   */
  public errors: DataflowError[] = []

  /**
   * Compares two values to determine if they are equivalent.
   *
   * This static property defaults to `Object.is` (same-value equality, not structural).
   *
   * It's possible to set this to a different comparison function, for example Lodash's `isEqual`
   * ({@link https://lodash.com/docs/4.17.15#isEqual}) that performs deep structural comparison.
   *
   *     Dataflow.isEqual = _.isEqual
   *
   * It defaults to `Object.is` for performance and security reasons (no dependencies).
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Equality_comparisons_and_sameness
   */
  public static isEqual: (a: unknown, b: unknown) => boolean = Object.is

  private nameToFn: Map<string, Fn> = new Map()
  private nodeToUpstreamNodes: Map<string, string[]> = new Map()
  private nodeToDownstreamNodes: Map<string, string[]> = new Map()
  private updateBatches: Queue = new Queue() // queue of {name: value} objects
  private valueChanged: { [index: string]: boolean } = {}
  private inProgress: boolean = false
  private debug: boolean

  /**
   * Creates a new dataflow graph.
   *
   *     const dataflow = new Dataflow()
   *
   * It's possible to define function nodes in the constructor, as an alternative to `define()`.
   *
   *     const dataflow = new Dataflow({ out: (x, y) => x + y })
   *
   * @param {Object} [functions] - An object of `name: function` pairs (optional).
   * @param {boolean} [debug=false] - Whether to log debug information to the console.
   */
  constructor(functions?: Record<string, Fn>, debug = false) {
    this.debug = debug
    if (functions) this.define(functions)
  }

  /**
   * Defines function nodes on the dataflow graph.
   *
   *     dataflow.define({ out: (x, y) => x + y })
   *
   * @param {Object} functions - An object of `name: function` pairs.
   */
  define(functions: Record<string, Fn>): this {
    for (const [fnName, fn] of Object.entries(functions)) {
      this.defineFn(fnName, fn)
    }

    return this
  }

  /** Defines a function node. */
  private defineFn(fnName: string, fn: Fn): void {
    if (!(fn instanceof Function))
      throw new Error('Parameter is not a function: ' + fn)
    if (this.nameToFn.has(fnName))
      throw new Error('Function is already defined: ' + fnName)

    // Index functions by name (these are the node names)
    this.nameToFn.set(fnName, fn)

    // Extract param names from function (these are the upstream dep names)
    const paramNames = getParamNames(fn)

    // Create DAG
    this.nodeToUpstreamNodes.set(fnName, paramNames)
    for (const usName of paramNames) {
      let dsFns = this.nodeToDownstreamNodes.get(usName)
      if (!dsFns) this.nodeToDownstreamNodes.set(usName, (dsFns = []))
      dsFns.push(fnName)
    }
  }

  /**
   * Sets the values of nodes on the dataflow graph, propagating any changes downstream.
   *
   *     dataflow.set({ x: 1, y: 2 });
   *
   * Call with `await` to wait for changes to finish propagating through the graph. (Only necessary
   * if your code depends on waiting for completion.)
   *
   *     await dataflow.set({ x: 1, y: 2 });
   *
   * Await without arguments to simply wait for dataflow change propagation to complete and for the
   * graph to settle before you read any of its values.
   *
   *     await dataflow.set();
   *     const result = dataflow.values.out
   *
   * See also `get()`.
   *
   * @param {Object} update - An object of `name: value` pairs.
   * @throws {DataflowError} Throws an error if a directed cycle of dependencies is detected between nodes.
   */
  async set(update: Record<string, unknown> = {}): Promise<Dataflow> {
    // Changes need to be scheduled, so that code running inside a node's function can call set.
    // If set is called while a node's function is running, the update will be only be run after
    // the current complete dataflow update has completed.
    // This allows for dynamic dataflow, in batched mode.
    this.updateBatches.push(update)

    // Don't process the updateBatches queue if there is already a Promise processing these batches
    if (!this.inProgress) {
      this.inProgress = true

      // Clear the `errors` array at the beginning of batch processing
      this.errors = []

      // Continue running batches until there are none left (batches can be dynamically added)
      while (this.updateBatches.hasItems()) {
        const updateBatch = this.updateBatches.shift()

        // Find the downstream transitive closure from all nodes reachable from the nodes listed
        // in updateBatch, and count the number of dirty upstream dependencies for each node
        for (const fn of this.nameToFn.values() as IterableIterator<FnInternal>) {
          fn.numDirtyDeps = 0
        }
        this.visitReachableFnsFromParams(
          Object.keys(updateBatch),
          (fn) => fn.numDirtyDeps++
        )

        // Mark all values as unchanged
        this.valueChanged = {}

        // Set the values of the nodes named in updateBatch, creating the initial dirty set of
        // direct downstream dependencies
        const dirtyNodeNames = new Set<string>()
        for (const [name, value] of Object.entries(updateBatch)) {
          // Make sure value is not a Promise (it needs to be a fully-resolved value)
          if (
            typeof value === 'object' &&
            typeof (value as Promise<unknown>).then === 'function'
          ) {
            throw new Error("Value of '" + name + "' cannot be a Promise")
          }

          this.setNodeValue(name, value, dirtyNodeNames)
        }

        // Propagate changes until all nodes in the transitive closure have been updated
        while (dirtyNodeNames.size > 0) {
          // Schedule and await all pending function calls.
          // For all (async) functions corresponding to dirty nodes,
          // fetch the cached value for all upstream deps (i.e. all params),
          // call the function, and collect the resulting promise.
          const promises: unknown[] = []
          const fnNames: string[] = []
          const fnArgs: unknown[][] = []

          for (const name of dirtyNodeNames) {
            // Get the named function
            const fn = this.nameToFn.get(name) as Fn

            // Get cached upstream node values for each parameter of fn
            const args: unknown[] = []
            const paramNames = this.nodeToUpstreamNodes.get(name) as string[]
            let someArgChanged = false
            const paramNamesAndArgs = this.debug ? {} : undefined

            for (const paramName of paramNames) {
              if (this.valueChanged[paramName]) {
                someArgChanged = true
              }

              const arg = this.values[paramName]
              args.push(arg)

              if (this.debug && paramNamesAndArgs) {
                paramNamesAndArgs[paramName] = arg
              }
            }

            fnNames.push(fn.name)
            fnArgs.push(args)

            if (someArgChanged) {
              // Only call fn if at least one param value changed, to avoid repeating work
              // (i.e. implement memoization)
              const promise = fn(...args)

              if (this.debug) {
                console.log('Calling:', { [name]: paramNamesAndArgs }, promise)
              }

              // Call fn with these params, returning the resulting promise
              promises.push(promise)
            } else {
              // Otherwise reuse cached val (we still need to propagate unchanged
              // value down dataflow graph, so that fn.numDirtyDeps gets correctly
              // decremented all the way down the transitive closure).
              promises.push(Promise.resolve(this.values[name]))
            }
          }

          // Clear the dirty nodes list to prep for the next stage of wavefront propagation
          dirtyNodeNames.clear()

          // Wait for all promises to be resolved, yielding maximal concurrency
          const promiseResults = await Promise.allSettled(promises)
          for (let i = 0; i < fnNames.length; i++) {
            const promiseResult = promiseResults[i]

            if (promiseResult.status === 'fulfilled') {
              // Cache successful function call results
              this.setNodeValue(fnNames[i], promiseResult.value, dirtyNodeNames)
            } else if (promiseResult.status === 'rejected') {
              // Log errors
              const errInfo: DataflowError = {
                functionName: fnNames[i],
                functionParams: fnArgs[i],
                reason: promiseResult.reason,
              }

              console.log('Error executing node:', errInfo)

              this.errors.push(errInfo)
            } else {
              console.log('Unknown promise result', promiseResult)
            }
          }
        }

        if (this.debug && this.updateBatches.hasItems()) {
          console.log('Starting next dynamic dataflow batch')
        }
      }

      this.inProgress = false

      if (this.debug) console.log('Dataflow ended')
    }

    return this
  }

  /** Visits a node and its transitive closure. */
  private visitNode(
    name: string,
    visited: Set<string>,
    visitedInPath: Set<string>,
    fnVisitor: (arg0: FnInternal) => unknown
  ) {
    if (visitedInPath.has(name)) {
      const visitedPath = [...visitedInPath]
      const idx = visitedPath.indexOf(name)
      const cyclePath: string[] = []

      for (let i = idx; i < visitedPath.length; i++) {
        cyclePath.push(visitedPath[i])
      }

      cyclePath.push(name)

      throw new Error(
        'Cycle detected, consisting of nodes: ' + cyclePath.join(' -> ')
      )
    }

    visitedInPath.add(name)

    if (!visited.has(name)) {
      visited.add(name)

      // Visit downstream functions of node recursively
      const dsFnNames = this.nodeToDownstreamNodes.get(name)
      if (dsFnNames) {
        for (const dsFnName of dsFnNames) {
          // Call visitor lambda on function node
          const dsFn = this.nameToFn.get(dsFnName) as FnInternal
          fnVisitor(dsFn)

          // Recurse to function node
          this.visitNode(dsFnName, visited, visitedInPath, fnVisitor)
        }
      }
    }

    visitedInPath.delete(name)
  }

  /** Visits the downstream transisive closure, starting from a list of param names. */
  private visitReachableFnsFromParams(
    paramNames: string[],
    fnVisitor: (arg0: FnInternal) => unknown
  ) {
    const visited = new Set<string>()
    const visitedInPath = new Set<string>()

    for (const paramName of paramNames) {
      this.visitNode(paramName, visited, visitedInPath, fnVisitor)
    }
  }

  /** Updates the value of a node, and propagates any change downstream. */
  private setNodeValue(
    name: string,
    value: unknown,
    dirtyNodeNamesOut: Set<string>
  ) {
    // Only propagate value if it changed
    const oldValue = this.values[name]
    const valueChanged = !Dataflow.isEqual(oldValue, value)
    this.valueChanged[name] = valueChanged

    if (valueChanged) {
      if (this.debug) {
        console.log('Setting:', { [name]: value })
      }
      this.values[name] = value
    }

    // Add names of direct downstream nodes to the dirtyNodeNamesOut set
    const dsFnNames = this.nodeToDownstreamNodes.get(name)
    if (dsFnNames) {
      dsFnNames.forEach((dsFnName) => {
        const dsFn = this.nameToFn.get(dsFnName) as FnInternal
        if (--dsFn.numDirtyDeps == 0) {
          // The current node is the last dependency of the downstream node that
          // needs updating, so the downstream node can be updated
          dirtyNodeNamesOut.add(dsFnName)
        }
      })
    }
  }

  /**
   * Returns the value of a node in the dataflow graph.
   *
   * It first waits for any dataflow change propagation to complete and for the graph to settle.
   *
   *     const result = await dataflow.get('out')
   *
   * @param {string} name - The node's name.
   */
  async get(name: string): Promise<unknown> {
    await this.set()
    return this.values[name] as unknown
  }
}

/**
 * Internal queue datastructure.
 */
class Queue<T = unknown> {
  private items: Array<T | undefined> = []
  private head = 0
  private tail = 0

  /** Adds an item to the tail of the queue (enqueue). */
  push(item: T) {
    this.items[this.tail++] = item
  }

  /** Removes one item from the head of the queue (dequeue). */
  shift() {
    const item = this.items[this.head]
    this.items[this.head++] = undefined
    return item
  }

  /** Whether the queue is has any items. */
  hasItems() {
    return this.tail !== this.head
  }
}

// Regular expressions for getParamNames()
const STRIP_COMMENTS = /((\/\/.*$)|(\/\*.*\*\/))/gm
const STRIP_KEYWORDS = /(\s*async\s*|\s*function\s*)+/
const ARGUMENT_NAMES =
  /\(([^)]+)\)\s*=>|([a-zA-Z_$]+)\s*=>|[a-zA-Z_$]+\(([^)]+)\)|\(([^)]+)\)/
const ARGUMENT_SPLIT = /[ ,\n\r\t]+/

/**
 * Extracts parameter names from a function.
 */
function getParamNames(func: Fn) {
  const fnStr = func
    .toString()
    .replace(STRIP_COMMENTS, '')
    .replace(STRIP_KEYWORDS, '')
    .trim()
  const matches = ARGUMENT_NAMES.exec(fnStr)

  let match: string | undefined
  if (matches) {
    for (let i = 1; i < matches.length; i++) {
      if (matches[i]) {
        match = matches[i]
        break
      }
    }
  }

  if (match === undefined) return []

  return match.split(ARGUMENT_SPLIT).filter((part) => part !== '')
}
