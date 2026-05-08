# Backend And Codegen

## Backend Goal

The JavaScript backend emits JavaScript AST from IR and prints it with esrap.
It should preserve source-level structure when the IR explicitly carries that
structure, and only materialize temporaries when a pass has made that necessary.

The backend is not the SSA builder. SSA construction and elimination belong in
IR passes; codegen consumes the post-pass IR shape.

## Directory Shape

| Directory | Responsibility |
| --- | --- |
| `src/backend/js` | Backend entrypoint, context, language helpers, ESTree types. |
| `src/backend/js/functions` | Function-level emission. |
| `src/backend/js/modules` | Static import/export record emission. |
| `src/backend/js/ops` | Operation emitters grouped by the same semantic domains as `src/ir/ops`. |

Keeping backend op emitters grouped by semantic domain makes it obvious where a
new IR op's JavaScript emission belongs.

## ESTree And esrap

Use ESTree objects as the backend interchange format and esrap as the printer.
Do not hand-build source strings for normal codegen.

The backend should define local ESTree type aliases in `ast.ts` for the node
shapes it constructs. This keeps emitters readable without requiring every file
to import broad parser or generator types.

## Codegen Context

`CodegenContext` owns backend-local state:

- binding names for declarations and values
- emitted statements
- expression values available for operation results
- fallthrough handling for structured control
- module-level emission state

The context should not become a frontend environment or analysis manager. It is
only the state needed to emit JavaScript from already-built IR.

## Structured Control Emission

Structured terminators emit source-level JavaScript constructs:

| IR | JavaScript |
| --- | --- |
| `IfTerminatorOp` | `if (...) { ... } else { ... }` |
| loop terminators | `while`, `do while`, `for`, `for-in`, `for-of` |
| `SwitchTerminatorOp` | `switch` |
| `TryTerminatorOp` | `try/catch/finally` |

Structured emitters must not accidentally emit the parent continuation inside a
nested construct. Use fallthrough handling: while emitting a structured region,
jumps to that region's exit block are treated as structural fallthrough, and the
exit block is emitted once by the enclosing emitter.

Raw `BranchTerminatorOp` remains a CFG primitive. It is not a structured
region by itself because it does not own an explicit exit block.

## Values And Temporaries

The backend should emit direct expressions when the IR value is still available
as an expression. It should not create temporaries just because a value is SSA.

When SSA elimination materializes block params or edge copies, the backend emits
the resulting `CopyValueOp` or value declarations. That keeps value
materialization a pass responsibility rather than hidden codegen behavior.

## Calls

Call emission must preserve receiver semantics.

```js
obj.method()
```

If lowering has separated the callee value from the receiver, the emitter must
still emit a method call form or equivalent code that preserves `this`.

## Modules

Static imports and exports come from `ModuleIR.imports` and `ModuleIR.exports`.
Dynamic import expressions come from `ImportExpressionOp`.

Default expression exports may need both:

- a runtime op when the exported value is produced by execution
- a module export record so linkers and emitters know the module exports
  `default`

## Compiler API

`compileSource` is the minimal public API for one source string:

```txt
parse -> build IR -> run passes -> generate JavaScript
```

`compileProject` walks a source tree, compiles supported source files, copies
assets/declarations, and reports diagnostics for copied compile failures.

The Vite plugin is the integrated development path. It should be exported as a
package subpath and should depend on Vite as a peer dependency plus a dev
dependency for local package development.
