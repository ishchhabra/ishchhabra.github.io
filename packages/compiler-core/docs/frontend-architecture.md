# Frontend Architecture

## Pipeline

The frontend runs in this order:

```txt
parseModule
  -> analyzeScopes
  -> ModuleIRBuilder
  -> FunctionIRBuilder.lowerProgram
  -> lowerDeclarationInstantiation
  -> lowerStatement / lowerExpression
```

This mirrors ECMAScript's split between declaration instantiation and runtime
execution. Declarations are collected before the body runs; executable lowering
then emits operations for runtime behavior.

## Scope Analysis Responsibilities

| Component                      | Responsibility                                                                                                                               |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `DeclarationCollector`         | Creates scopes, collects declarations, records binding nodes, records module-level declarations, and builds declaration-instantiation order. |
| `ReferenceResolver`            | Answers "which binding does this identifier use?" after scopes and declarations are known.                                                   |
| `ScopeGraph`                   | Stores scope ownership, binding-to-declaration mappings, reference resolution, global references, and private names.                         |
| `DeclarationTable`             | Owns declaration records by id.                                                                                                              |
| `DeclarationInstantiationPlan` | Records the work each scope performs before executing its body.                                                                              |

Keep collection and resolution separate. Declaration collection answers "what
bindings exist here?" Reference resolution answers "which binding does this
identifier use?" Merging them would make hoisting, TDZ, function declarations,
imports, and globals harder to model correctly.

## Builders

`ModuleIRBuilder` owns module-level construction policy:

- creates the `ModuleIR`
- creates the top-level entry `FunctionIR`
- runs scope analysis
- collects static module records
- delegates executable body lowering to `FunctionIRBuilder`

`FunctionIRBuilder` owns one function insertion point:

- current block selection
- block, value, operation, and nested-function allocation
- declaration/reference/private-name queries
- control-context stack for `break`, `continue`, and labels
- operation emission and termination

The builder receives an `IRBuildContext`, not a broad environment object. The
context should stay limited to shared frontend services: ids, declarations,
scope graph, and declaration-instantiation plan.

## Declaration Instantiation

Declaration instantiation is explicit because ECMAScript creates many bindings
before statement execution reaches their source syntax.

Examples:

```js
x = 1;
var x = 2;
```

The `var x` binding exists before the first assignment executes. Runtime
lowering for `var x = 2` stores `2`; declaration-instantiation lowering creates
the initial binding state.

```js
f();
function f() {}
```

Function declarations are instantiated before runtime statement execution, so
`lowerStatement` does not emit the declaration body when it sees the statement.
The function body is created and assigned during declaration instantiation.

## Bindings

Use binding ops for simple declaration-backed storage:

| Op                    | Meaning                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------ |
| `InitializeBindingOp` | Initialize a source binding that exists but has not received its runtime value.            |
| `StoreBindingOp`      | Write an already-initialized mutable binding. May produce the assignment completion value. |
| `LoadBindingOp`       | Read a source binding.                                                                     |

For destructuring, use pattern-level ops instead of lowering immediately into
iterator/property micro-ops. This preserves source-level codegen while still
giving later passes a clear semantic boundary.

| Op                        | Meaning                                                    |
| ------------------------- | ---------------------------------------------------------- |
| `DestructureBindingOp`    | Initialize or store a binding pattern from a source value. |
| `DestructureAssignmentOp` | Assign an assignment target pattern from a source value.   |

## Expressions

Expression lowerers live under `src/frontend/expressions` and return `Value`
when the expression produces a value. Statement lowerers decide whether that
value must be preserved as completion value or can be discarded.

Call expressions must preserve receiver semantics:

```js
obj.method();
```

The call target is not just `obj.method`; it also carries `obj` as the receiver
so emitted JavaScript preserves `this`.

Logical expressions, optional chains, and conditional expressions should use
structured `IfTerminatorOp` edge targets when they produce branch-dependent
values. Direct edge operands are preferred over empty pass-through blocks.

## Control Flow

Source-level control constructs keep structure when that helps JavaScript
codegen:

| Source construct                               | Preferred IR                |
| ---------------------------------------------- | --------------------------- |
| `if` statements and conditional expressions    | `IfTerminatorOp`            |
| loop tests inside loops                        | `BranchTerminatorOp`        |
| `while`, `do while`, `for`, `for-in`, `for-of` | structured loop terminators |
| `switch`                                       | `SwitchTerminatorOp`        |
| `try/catch/finally`                            | `TryTerminatorOp`           |

Raw CFG branches still exist for internal control decisions and future
optimizer-produced CFG.

## Modules

Static module syntax produces `ModuleIR` import/export records. Runtime dynamic
`import()` produces `ImportExpressionOp`.

This split keeps link-time information queryable without scanning executable
operations, while preserving runtime import behavior as an ordinary expression.

## Private Names

Private names are not normal declarations. A class private name such as `#x`
identifies a brand-keyed private slot, not a string property named `"x"`.

`ScopeGraph` owns private-name resolution so all uses of the same class private
name map to the same `PrivateName`.
