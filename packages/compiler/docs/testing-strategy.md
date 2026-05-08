# Testing Strategy

## Test Runner

Use Vitest for compiler unit tests. It is fast, TypeScript-friendly, and
works well for colocated tests without adding Jest/SWC configuration.

## What To Test

| Area | Test |
| --- | --- |
| Core IR | Ownership, duplicate insertion rejection, detach/attach behavior, def-use updates, block params, terminator use-lists. |
| Ops | Operands, results, effects, cloning, `withOperands`, and operation-specific invariants. |
| Scope analysis | Declaration collection, reference resolution, globals, private names, hoisting, and scope ownership. |
| Lowering | The IR shape for each supported AST construct. |
| Backend | Generated JavaScript for representative IR and compile-source examples. |
| Passes | IR mutation effects, analysis invalidation, edge rewrites, dominance-sensitive cases, and copy scheduling. |
| Compiler API | `compileSource`, `compileProject`, diagnostics, and Vite plugin integration boundaries. |

## What Not To Test Directly

| Target | Reason |
| --- | --- |
| Trivial private helpers | They should be covered through public behavior. |
| TypeScript-only shape | The compiler already type-checks it. |
| Exact object identity where semantics do not require it | Prefer semantic assertions over brittle implementation details. |
| Unsupported syntax as success cases | Unsupported nodes should throw clear errors until implemented. |

Complex private algorithms are an exception. A helper such as
`ParallelCopyScheduler` deserves direct tests because correctness is subtle and
not tied to one public API.

## Test Utilities

Create shared test utilities only after reuse appears in multiple tests. Keep
small local builders in the test file when they are only used there.

Good shared utilities:

- `testModule(...)`
- `testFunction(...)`
- `testBlock(...)`
- `testValue(...)`
- parser helpers for frontend tests
- IR inspection helpers used by several lowering tests

Avoid a global fixture builder that hides the behavior being tested.

## Snapshot Policy

Prefer focused structural assertions for core IR and pass tests. Use snapshots
only for larger frontend/backend outputs where the shape is intentionally broad.

Frontend snapshots should be stable IR summaries, not raw object dumps. Raw
object dumps include owner links and sets that make snapshots noisy and brittle.

## Placement

Colocate tests with the unit under test:

| Source | Test |
| --- | --- |
| `src/ir/core/Block.ts` | `src/ir/core/Block.test.ts` |
| `src/ir/ops/operators/BinaryOp.ts` | `src/ir/ops/operators/BinaryOp.test.ts` |
| `src/frontend/expressions/lowerCallExpression.ts` | `src/frontend/expressions/lowerCallExpression.test.ts` |
| `src/backend/js/generateJavaScript.ts` | `src/backend/js/generateJavaScript.test.ts` |

This keeps compiler tests close to the semantics they protect.
