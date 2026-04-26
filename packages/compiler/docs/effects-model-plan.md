# Effects Model — Implementation Plan

## Goal

Replace the single `Operation.hasSideEffects(env): boolean` with a richer, orthogonal effects model and a small set of derived predicates that passes consume.

A single boolean conflates independent properties (memory writes, throwing, divergence, determinism, observability). Each transformation needs a different combination, so a single bool either over-rejects (lost optimizations) or over-accepts (miscompiles — e.g. duplicating a `LoadProperty` past a getter).

## The Model

### Five orthogonal axes on `Operation`

| Axis | Type | Default | Meaning |
|---|---|---|---|
| `getMemoryEffects(env?)` | `MemoryEffects` | `NoEffects` | Heap reads/writes (already exists) |
| `mayThrow(env?)` | `boolean` | `false` | Can raise (TDZ, null deref, coercion, user throw, opaque call) |
| `mayDiverge(env?)` | `boolean` | `false` | Can fail to terminate (loops, opaque calls) |
| `isDeterministic` | `boolean` | `true` | Same inputs → same output. False for `Date.now`, `Math.random`, mutable global loads, opaque calls |
| `isObservable(env?)` | `boolean` | `false` | Externally visible beyond heap (`console.*`, DOM, `debugger`, opaque calls) |

### Memory location vocabulary (already exists, keep as-is)

```
MemoryLocation =
  | { kind: "unknown" }                                  // aliases everything
  | { kind: "local",            declarationId }
  | { kind: "context",          declarationId }
  | { kind: "exported",         modulePath, name }
  | { kind: "staticProperty",   object: Value, name }
  | { kind: "computedProperty", object: Value }

MemoryEffects = { reads: MemoryLocation[], writes: MemoryLocation[] }
```

### Derived predicates (the only thing passes call)

```ts
isDCERemovable(op, env)  = writes(op).length === 0
                        && !mayThrow(op, env)
                        && !isObservable(op, env)

isSpeculatable(op, env)  = writes(op).length === 0
                        && !mayThrow(op, env)
                        && !mayDiverge(op, env)
                        && !isObservable(op, env)

isDuplicable(op, env)    = reads(op).length === 0
                        && writes(op).length === 0
                        && op.isDeterministic
                        && !mayThrow(op, env)
                        && !mayDiverge(op, env)

canReorderWith(a, b, env) = memoryDisjoint(a, b)
                         && throwOrderPreserved(a, b)
                         && observableOrderPreserved(a, b)
```

Passes never query raw axes. They call the predicate matching their transformation.

## Worked Examples

| Op | reads | writes | mayThrow | mayDiverge | isDeterministic | isObservable |
|---|---|---|---|---|---|---|
| `1 + 2` (numeric literals) | ∅ | ∅ | false | false | true | false |
| `a + b` (unknown types) | ∅ | ∅ | **true** (ToPrimitive) | false | true | false |
| `o.x` | ∅ | ∅ | **true** (null deref, getter) | false | true | false |
| `o.x = v` | ∅ | `[staticProp(o,"x")]` | true | false | true | false |
| `Math.sin(x)` (builtin) | ∅ | ∅ | false | false | true | false |
| `Math.random()` | ∅ | ∅ | false | false | **false** | false |
| `console.log(x)` | ∅ | ∅ | false | false | true | **true** |
| `arr.push(x)` | ∅ | `[staticProp(arr,"length"), computedProp(arr)]` | true | false | true | false |
| `while(true){}` terminator | ∅ | ∅ | false | **true** | true | false |
| `foo()` (cross-module opaque) | `[unknown]` | `[unknown]` | **true** | **true** | **false** | **true** |
| `foo()` (known-pure local) | ∅ | ∅ | false | false | true | false |

Note: `LoadProperty` is the canonical "looks pure but isn't duplicable" case. `reads` is empty in our model (we don't track the heap slot a getter touches), but `mayThrow=true` makes `isDuplicable=false` automatically — which is the correct outcome and resolves the getter-duplication hazard called out in `packages/compiler/CLAUDE.md`.

## Implementation Plan

### Phase 1 — Add the axes (conservative defaults)

1. In `src/ir/core/Operation.ts`, add to the base class. **Defaults are maximally conservative** — every derived predicate must return `false` for an un-overridden op. An op opts *into* optimization by overriding axes it can prove safe.

   ```ts
   getMemoryEffects(_env?: Environment): MemoryEffects {
     return { reads: [UnknownLocation], writes: [UnknownLocation] };
   }
   mayThrow(_env?: Environment): boolean { return true; }
   mayDiverge(_env?: Environment): boolean { return true; }
   get isDeterministic(): boolean { return false; }
   isObservable(_env?: Environment): boolean { return true; }
   ```

2. `Trait.Pure` is the escape hatch. Ops marked `Pure` get an optimistic short-circuit on every axis (no reads/writes, no throw, no diverge, deterministic, not observable). This keeps the trait meaningful and lets a single tag opt a whole op into "all axes clean."

3. Add `src/ir/effects/predicates.ts` exporting `isDCERemovable`, `isSpeculatable`, `isDuplicable`, `canReorderWith`. Pure functions over `Operation` + `Environment`.

4. **Delete `hasSideEffects` from the base class in this same phase.** Do not preserve it as a compatibility shim — the conservative defaults would make it return `true` for every un-audited op and silently disable DCE everywhere. Migrating call sites (Phase 4) is the only safe path.

### Phase 2 — Override per op

For each op under `src/ir/ops/`, set the axes that differ from default. Group by category:

- **Arithmetic / logical** (`BinaryExpression`, `UnaryExpression`, `LogicalExpression`):
  `mayThrow` = true unless both operands are statically known primitives. Conservative default `true`.
- **Literals** (`Literal`, `RegExpLiteral`, `TemplateLiteral` w/o expressions, `Hole`): all axes default.
- **Property** (`LoadProperty`, `StoreProperty`, `LoadGlobal`):
  - `LoadProperty`: `mayThrow=true`, `isDeterministic=true` (we don't model getter state).
  - `StoreProperty`: `writes=[staticProp/computedProp]`, `mayThrow=true`.
  - `LoadGlobal`: `mayThrow=true` (TDZ/ReferenceError), `isDeterministic=false` (mutable global).
- **Calls** (`CallExpression`, `NewExpression`):
  - Default (opaque): all axes pessimistic — `reads=[unknown], writes=[unknown], mayThrow=true, mayDiverge=true, isDeterministic=false, isObservable=true`.
  - When `callee` resolves to a builtin in `src/ir/builtins.ts`, consult the table per-axis (extend the table from a single `pure: bool` to the five-axis record below).
- **Control / debugger / spread**: `Debugger` → `isObservable=true`. `SpreadElement` → `mayThrow=true`.
- **This / MetaProperty**: all axes default.
- **Object/Array literals**: per-element analysis; literal-only contents → all defaults; with getters/spreads → `mayThrow=true`.

### Phase 3 — Extend the builtin table

In `src/ir/builtins.ts`, change the per-builtin record from `{ pure: boolean }` to:

```ts
interface BuiltinEffects {
  reads:           "none" | "args" | "unknown";
  writes:          "none" | "args" | "unknown";
  mayThrow:        boolean;
  mayDiverge:      boolean;
  isDeterministic: boolean;
  isObservable:    boolean;
}
```

Seed the obvious entries: `Math.*` arithmetic (all-clean except `random` which is `isDeterministic=false`), `console.*` (`isObservable=true`), `Array.prototype.push/pop/shift/unshift/splice` (`writes="args"`), `Object.keys/values/entries` (`reads="args"`), etc. Anything not in the table stays opaque.

`CallExpressionOp` translates `"args"` into concrete `MemoryLocation`s using the call's argument `Value`s.

### Phase 4 — Migrate call sites

Four call sites today:

| File | Line | Today | Replace with |
|---|---|---|---|
| `pipeline/passes/DeadCodeEliminationPass.ts` | 97 | `op.hasSideEffects(env)` | `!isDCERemovable(op, env)` |
| `pipeline/passes/ConstantPropagationPass.ts` | 578 | `!op.hasSideEffects(env)` | `isDCERemovable(op, env)` (verify intent — may want `isDuplicable` if folding into multiple uses) |
| `pipeline/passes/ExpressionInliningPass.ts` | 188 | `op.hasSideEffects(env)` | `!isDCERemovable(op, env)` for the keep-because-effectful guard; **also** add `isDuplicable(op, env)` check on the inlining decision itself if not already present (this is the getter-hazard fix) |
| `pipeline/late-optimizer/passes/LateDeadCodeEliminationPass.ts` | (find) | `op.hasSideEffects(env)` | `!isDCERemovable(op, env)` |

For each: read the surrounding logic, decide which derived predicate matches the transformation's actual requirement, and switch.

### Phase 5 — (folded into Phase 1)

`hasSideEffects` is removed in Phase 1. Phases 1–4 must land atomically; the codebase will not compile in between.

### Phase 6 — Tests

For every op touched in Phase 2, add a fixture or unit test asserting its five-axis values. Add fixture tests for:

- DCE keeps `console.log("x")` even though it has no writes (observability).
- DCE removes a dead `Math.random()` call (writes=∅, !mayThrow, !isObservable — even though non-deterministic).
- Copy-prop / inlining does **not** duplicate `o.x` into multiple uses (mayThrow → !isDuplicable).
- Copy-prop **does** duplicate `1 + 2` into multiple uses.
- LICM does not hoist `while(true){}` out of a guarded branch (mayDiverge).
- An opaque cross-module call is treated as a full barrier (no reorder, no DCE, no dup).

## Out of Scope (followups)

- **Per-operand effects** (React Compiler's Read/Mutate/Capture/Store) — finer resolution within the memory axis. Worthwhile later, but orthogonal to this plan.
- **Escape analysis** — narrowing `unknown` writes to "args + globals" when an argument hasn't escaped. High-value but a separate workstream.
- **Cross-module summaries** — emitting `{ exportName → effects }` sidecars so opaque imports stop being optimization barriers. Requires a build-graph change.
- **Alias oracle improvements** beyond the current `unknown`-clobbers-all model.

## Risks

- **Phase 2 conservatism**: defaulting `mayThrow=true` for non-pure ops may regress optimizations that today incorrectly assumed purity via `Trait.Pure` mis-tagging. Audit `Trait.Pure` assignments while doing Phase 2.
- **Builtin table churn**: extending each entry from one bool to six fields is mechanical but large. Land the table change in its own commit.
- **Call-site intent ambiguity**: at each `hasSideEffects` migration, the right replacement may not be `isDCERemovable` — it might be `isDuplicable` or `isSpeculatable`. Do not blindly substitute. Read each pass.

## Order of commits

1. Add axes + default impls to `Operation` base. Reimplement `hasSideEffects` in terms of them. (No behavior change.)
2. Add `src/ir/effects/predicates.ts` with derived predicates + tests.
3. Extend `BuiltinEffects` record + populate table. Update `CallExpressionOp` to consult per-axis.
4. Override axes per op category (one commit per category: prop, arith, call, control, object/array).
5. Migrate the four call sites, one commit each, with fixture tests demonstrating the behavioral win (especially the getter-duplication fix).
6. Delete `hasSideEffects`.
