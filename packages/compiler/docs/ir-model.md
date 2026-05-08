# IR Model

## Core Graph

| Object | Role |
| --- | --- |
| `ModuleIR` | Compilation unit for one source module. Owns functions plus static import/export records. |
| `FunctionIR` | Function body container. Owns params and ordered basic blocks. |
| `BasicBlock` | Linear operation sequence with zero or one final terminator. Owns block params and predecessor use-list. |
| `Operation` | Executable IR node. Reads operands, produces results, has effects, and may be owned by a block. |
| `TerminatorOp` | Operation that ends a block and owns successor edges. |
| `Value` | SSA data dependency. Used by operands, results, block params, and some function-level structure. |

Ownership is by reference. Detached objects use `null` owner fields. Mutation
should go through owner APIs so def-use links, block use-lists, and ownership
back-pointers stay consistent.

## Operations

`Operation` exposes:

- `id`: stable operation identity
- `ownerBlock`: attached block or `null`
- `results`: immutable result list
- `result`: convenience getter for exactly one result
- `operands()`: SSA values read by the op
- `effects()`: memory and observable behavior summary
- `withOperands(...)`: functional operand rewrite hook
- `clone(...)`: graph clone hook using `OperationCloneContext`
- `verify()`: operation-local invariant check
- `attach(...)` and `detach()`: ownership plus def-use maintenance

Multi-result support is represented by `results`. Single-result ops should use
`result` at call sites that require exactly one value.

## Values

`Value` does not own source names. Names are a printing/codegen concern, handled
by helpers such as `valueToJsName(value)`.

`Value.declarationId` links SSA values back to source-level declarations when
that relationship exists. Multiple SSA values may share one declaration id
after promotion because they represent different versions of one source binding.

`Value.users` includes operations and function-level structural uses. Code that
needs only executable users must filter to `Operation`.

## Blocks And Terminators

`BasicBlock.operations` is an array because program order matters and duplicate
operation identity is forbidden by ownership, not by collection type. A set
would lose ordering and complicate insertion, scheduling, and codegen.

The terminator is kept inside `operations` as the final operation. This keeps
rewrites uniform and avoids separate operation and terminator replacement paths.

`BasicBlock.uses` is a `Set<TerminatorOp>` because only terminators own CFG
successor edges. `predecessors()` is derived from that use-list and the current
successor targets.

## Block Parameters

Block params are the IR's phi representation. A predecessor edge passes
successor operands; the target block binds them positionally to its params.

```txt
then:
  jump join(v1)
else:
  jump join(v2)
join(x):
  return x
```

This is represented as a block param `x`, not a `PhiOp` inside `join`.

## Successor Operands

Successor operands are split into `produced` and `forwarded`.

| Kind | Meaning | Examples |
| --- | --- | --- |
| `forwarded` | Existing SSA values passed from the predecessor block. | `jump join(x)`, conditional expression pass-through values. |
| `produced` | Values supplied by the terminator's own runtime semantics. | for-of iteration value, for-in key, catch exception. |

The target block receives `produced` values first, then `forwarded` values.
Passes that eliminate block params must not blindly demote produced params,
because those values are created by the edge semantics rather than by an
ordinary predecessor operation.

## Structured And Raw Control

| Terminator | Use |
| --- | --- |
| `BranchTerminatorOp` | Raw CFG condition with true/false successors. Useful for loop tests and optimizer-created CFG. |
| `IfTerminatorOp` | Source-level or expression-level structured if with an explicit exit block. |
| Loop terminators | Source-level loops that preserve body/test/update/exit structure for JS codegen. |
| `TryTerminatorOp` | Structured `try/catch/finally` region delegated to JS codegen. |
| `JumpTerminatorOp` | Unconditional edge with optional forwarded values. |
| `ReturnTerminatorOp` and `ThrowTerminatorOp` | Abrupt function or exception exits. |

`targetCount()` and `target(index)` describe all structural target slots.
`successorIndices()` describes executable CFG successors for analyses.

## Effects

`OperationEffects` is the public effect contract. It includes memory reads,
memory writes, throwing, divergence, and observability.

`MemoryLocation` is an alias-analysis category, not a runtime object. Use
specific locations when known and `UnknownMemoryLocation` when JavaScript
semantics are opaque.

| Location | Use |
| --- | --- |
| `binding` | Declaration-backed binding storage. |
| `global` | Host/global object lookup. |
| `property` | Object property storage with named, symbol, or unknown key. |
| `value` | Materialized local storage for an IR value after SSA elimination. |
| `unknown` | Conservative fallback that aliases everything. |

## Op Grouping

Concrete ops belong under `src/ir/ops` by semantic runtime domain:

| Directory | Examples |
| --- | --- |
| `async` | `AwaitExpressionOp` |
| `bindings` | `LoadBindingOp`, `InitializeBindingOp`, `StoreBindingOp` |
| `calls` | `CallOp`, `ConstructOp`, `SuperCallOp` |
| `classes` | `CreateClassOp` |
| `constants` | `ConstantOp` |
| `control` | terminators |
| `functions` | `CreateFunctionOp`, `LoadThisOp`, `MetaPropertyOp` |
| `globals` | `LoadGlobalOp` |
| `jsx` | JSX element and fragment ops |
| `literals` | RegExp and template literals |
| `modules` | Runtime module ops such as dynamic import or default value export |
| `objects` | Object and array literal creation |
| `operators` | Unary, binary, delete, update, sequence |
| `patterns` | Destructuring binding and assignment |
| `properties` | Property load/store/private/super ops |
| `values` | IR value materialization helpers such as copies |
