# Architecture Decisions

## Principles

Compiler-2 is a production rewrite of the POC compiler. The core direction is
to keep ECMAScript semantics explicit, keep IR ownership boring, and avoid
project-wide "environment" objects that accumulate unrelated responsibilities.

The compiler should prefer semantic boundaries over syntax mirroring. Syntax
lowerers may be organized by AST node family, but IR ops and backend emitters
should be grouped by the runtime domain they model.

## Package Shape

| Area | Directory | Decision |
| --- | --- | --- |
| Public compile API | `src/compile` | Owns source/project compilation, diagnostics, and pass orchestration. |
| Frontend | `src/frontend` | Parses, analyzes scopes, instantiates declarations, and lowers AST to IR. |
| Core IR | `src/ir/core` | Owns graph containers and primitive IR objects. |
| Effects | `src/ir/effects` | Owns operation effect summaries and alias categories. |
| Ops | `src/ir/ops` | Owns concrete operations grouped by semantic domain. |
| Analyses | `src/ir/analysis` | Owns pure cached facts such as dominators and promotability. |
| Passes | `src/ir/passes` | Owns IR mutation passes and pass orchestration. |
| JavaScript backend | `src/backend/js` | Lowers IR to ESTree and emits JavaScript through esrap. |
| Vite integration | `src/vite` | Exposes the production Vite plugin integration. |

## Core Decisions

| Decision | Why |
| --- | --- |
| Use `ModuleIR`, `FunctionIR`, `BasicBlock`, `Operation`, `TerminatorOp`, and `Value` as the core vocabulary. | Names are explicit and avoid POC abbreviations such as `FuncOp` and `TermOp`. |
| `FunctionIR` is not an `Operation`. | A function body is a container/region. Function creation is represented by `CreateFunctionOp`; the body itself owns blocks and params. |
| Use separate opaque ids for modules, functions, blocks, operations, values, declarations, and private names. | These ids identify different registries and should not be accidentally interchangeable. |
| Put JSDoc on exported opaque id types, not on private brand symbols. | The exported type is the public contract; the symbol is an implementation detail. |
| Use `null` for detached ownership fields. | `null` means intentionally no owner; `undefined` is avoided for initialized ownership state. |
| Keep `BasicBlock.operations` as an ordered array with the terminator as the final operation. | Terminators are operations and should participate in rewrites, iteration, and ownership uniformly. |
| Keep `BasicBlock.terminator` as a derived getter. | The terminator is structurally final, but not stored in a second source of truth. |
| Keep block use-lists as `Set<TerminatorOp>`. | Only terminators own CFG successor edges; using `Operation` would weaken the contract. |
| Use block parameters instead of `PhiOp`. | Block args make SSA edge values explicit and match the IR shape used by MLIR-style systems. |
| Distinguish `produced` and `forwarded` successor operands. | Some structured terminators produce values as part of control flow, such as for-of iteration values and catch exceptions. |
| Keep both raw `BranchTerminatorOp` and structured `IfTerminatorOp`. | Raw branches are CFG decisions; source-level `if` needs an explicit region exit for structured codegen. |
| Keep structured loop terminators for source loops. | Loops carry source structure that helps JS codegen while still exposing executable CFG successors through `successorIndices()`. |
| Keep `TryTerminatorOp` structured for now. | JavaScript codegen can delegate completion semantics to real JS `try/catch/finally`; explicit completion records are only needed before flattening or non-JS backends. |
| Static imports and exports are module records, not ordinary ops. | Static module edges are link-time structure. Dynamic `import()` remains an operation because it executes at runtime. |
| Use operation effects, not "memory effects" as the public operation API name. | Effects include memory reads/writes plus throwing, divergence, and observability. |
| Use a single `PropertyKey` abstraction for property ops. | Static and dynamic property syntax share runtime semantics and should not become separate op families unless optimization proves it necessary. |
| Do not store object-literal shorthand as IR semantics. | Shorthand is source syntax; codegen can recover it from equivalent key/value structure when desired. |
| Use a `PrivateName` registry for private class names. | Private names are brand-keyed slots, not ordinary string properties or normal lexical declarations. |
| Preserve call receiver semantics explicitly. | `obj.method()` must keep `this === obj`; lowering cannot treat it as a plain function call. |

## Things To Revisit Deliberately

| Topic | Current Direction | Revisit When |
| --- | --- | --- |
| Completion records | Keep structured `TryTerminatorOp`. | A flat CFG backend or non-JS backend needs exact `return`/`throw`/`break`/`continue` resumption. |
| Shared `ValueOperandOwner` protocol | Not introduced yet. | More non-operation IR containers own values beyond `FunctionIR`. |
| Full structured region recovery | Not required yet. | Codegen needs to emit arbitrary optimizer-produced CFG as structured JavaScript. |
| Analysis invalidation precision | `PreservedAnalyses` exists, but passes can conservatively invalidate. | Optimization pipelines become expensive enough to need precise caching. |
