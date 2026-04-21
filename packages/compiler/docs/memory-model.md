# The memory model: effects, aliasing, and the walker

A walk-through of what we built, why, and what's left. Take your time.

---

## The big idea in one sentence

Every op declares what memory it touches; the alias oracle says which locations could overlap; the walker reconstructs "what store does this load see?" on demand — **no persistent graph, no invalidation tax**.

---

## Part 1 — The problem we're solving

Optimizing passes need to answer questions like:

- **Constant propagation:** "This load reads `x`. What value was last stored to `x`?"
- **Dead store elimination:** "This store writes `y`. Is any later load going to read it?"
- **Global value numbering:** "I've seen `load p` before. Is the value still valid, or has something written through an aliasing pointer?"
- **Loop-invariant code motion:** "Can I hoist this load out of the loop, or does the loop body maybe write to it?"

Every one of these is really the same question: **given an op that reads memory, which earlier op(s) could have written the value it observes?**

A naïve answer ("scan all earlier ops") is quadratic per pass. Compilers have tried many data structures to do better. We picked the modern consensus one.

---

## Part 2 — Three layers, bottom-up

### Layer A: `MemoryLocation` — the vocabulary

Every memory cell the compiler reasons about is named by a `MemoryLocation`. It's a tagged union:

```ts
type MemoryLocation =
  | { kind: "local"; declarationId } // a var/let/const cell
  | { kind: "context"; declarationId } // a closure-captured cell
  | { kind: "exported"; modulePath; name } // an ES module export binding
  | { kind: "staticProperty"; object; name } // obj.foo
  | { kind: "computedProperty"; object } // obj[x]
  | { kind: "unknown" }; // "anywhere"
```

Think of each `MemoryLocation` as a label on a box. Two ops touching the same label are touching the same box. Two ops touching different labels might still be touching the same box (aliasing) — that's what the oracle answers.

### Layer B: `getMemoryEffects()` — self-describing ops

Every op class declares what it reads and writes:

```ts
class LoadLocalOp {
  getMemoryEffects() {
    return { reads: [localLocation(this.value.declarationId)], writes: [] };
  }
}

class StoreLocalOp {
  getMemoryEffects() {
    return { reads: [], writes: [localLocation(this.lval.declarationId)] };
  }
}

class LiteralOp {
  // inherits base class: returns { reads: [], writes: [] } — pure
}

class CallExpressionOp {
  getMemoryEffects(env) {
    // Pure builtin (Math.sqrt, JSON.stringify with const arg…)? No effects.
    // Otherwise: assume the call could touch anything.
    return isPure(this, env) ? { reads: [], writes: [] } : { reads: [Unknown], writes: [Unknown] };
  }
}
```

This is the MLIR `MemoryEffectOpInterface` pattern and the TurboShaft `OpEffects` pattern. The op carries its own truth. No side table, no stale metadata after an edit — if you rewrite an op, the new op declares its new effects.

### Layer C: `AliasOracle` — "could these two labels overlap?"

Coming up in Part 4. Skip there if you want the short version.

### Layer D: `MemoryStateWalker` — "what store reaches this load?"

A stateless (per-function lazy) helper. You give it a function; it computes, on first query, a per-op snapshot of "last store per location, visible at this op's entry." All later queries hit the snapshot.

No graph. No phi nodes. No invalidation API.

---

## Part 3 — A worked example

Source code:

```js
var x = 1; // Op A
var o = {}; // Op B
x = 2; // Op C
o.x = 99; // Op D
var y = x; // Op E
var z = o.x; // Op F
```

Let's trace what each layer sees.

### Layer B output: effects per op

| Op                                         | reads                    | writes                   |
| ------------------------------------------ | ------------------------ | ------------------------ |
| A `var x = 1`                              | —                        | `local(x)`               |
| B `var o = {}`                             | —                        | `local(o)`               |
| C `x = 2`                                  | —                        | `local(x)`               |
| D `o.x = 99`                               | —                        | `staticProperty(o, "x")` |
| E `var y = x` ← this generates a LoadLocal | `local(x)`               | —                        |
| E `var y = x` ← and a StoreLocal           | —                        | `local(y)`               |
| F `var z = o.x` ← LoadStaticProperty       | `staticProperty(o, "x")` | —                        |
| F `var z = o.x` ← StoreLocal               | —                        | `local(z)`               |

### Layer D walker trace

The walker visits ops in program order, maintaining a "last store per location key" table:

```
                            state after op
─────────────────────────   ───────────────────────────────────
(start)                     {}
A: local(x) = ...           { local(x): A }
B: local(o) = ...           { local(x): A, local(o): B }
C: local(x) = ...           { local(x): C, local(o): B }       ← A overwritten
D: staticProperty(o,x) = ... { local(x): C, local(o): B, staticProperty(o,x): D }
E-read x: reads local(x)    snapshot at E: { local(x): C, local(o): B, staticProperty(o,x): D }
E-write y: local(y) = ...   { local(x): C, local(o): B, staticProperty(o,x): D, local(y): E }
F-read o.x: reads stat(o,x) snapshot at F: { local(x): C, local(o): B, staticProperty(o,x): D, local(y): E }
F-write z: local(z) = ...   (irrelevant to below)
```

### Queries the walker can now answer

```ts
walker.reachingStore(E, localLocation(x_declId));
//  →  Op C   (the `x = 2` assignment)
```

When CP evaluates the `LoadLocal x` inside `var y = x`, it asks the walker: "what store reaches this load on location `local(x)`?" Answer: Op C. CP then looks at Op C's stored value (the literal `2`), and folds the load to `2`.

```ts
walker.reachingStore(F, staticPropertyLocation(o_place, "x"));
//  →  Op D   (the `o.x = 99` assignment)
```

Same flow for `var z = o.x` → folds to `99`.

**Key property:** `local(x)` and `staticProperty(o, "x")` are **different categories** (see below). Op D does NOT clobber the reaching store for `local(x)`. That's why the ReactiveFlags-style bug can't happen here: a property write never hides a local binding update.

---

## Part 4 — What is `AliasOracle`?

Short version: **a function that takes two `MemoryLocation`s and answers "could these two labels name the same box?"**

It's needed because sometimes different labels point to the same memory:

```js
var o = someObject;
o.x = 1;
o["x"] = 2; // reads via computedProperty(o), but writes to SAME cell
var y = o.x; // do we see 1 or 2?
```

Here `staticProperty(o, "x")` and `computedProperty(o)` are different `MemoryLocation` labels. The oracle says "yes, those may alias" because the computed `o[x]` could resolve to `"x"`. The walker then conservatively treats the computed write as clobbering the static property.

### Our `AliasOracle` rules (v1)

**Step 1: Category check (Cranelift-style).** Every location belongs to a category:

| MemoryLocation kind                  | Category   |
| ------------------------------------ | ---------- |
| `local`                              | `local`    |
| `context`                            | `context`  |
| `exported`                           | `exported` |
| `staticProperty`, `computedProperty` | `property` |
| `unknown`                            | `unknown`  |

- `unknown` category aliases everything (wildcard).
- Otherwise, **different categories never alias.** A local-variable write cannot affect a property read. Same-category → fall through to finer rules.

This category check is the big precision win — it's a tag compare, very cheap, catches 80% of the non-aliasing cases.

**Step 2: Same-category rules.**

| Kind                                                 | Aliases another of the same kind iff…      |
| ---------------------------------------------------- | ------------------------------------------ |
| `local(d1)` vs `local(d2)`                           | `d1 === d2` (same declaration)             |
| `context(d1)` vs `context(d2)`                       | `d1 === d2`                                |
| `exported(m1, n1)` vs `exported(m2, n2)`             | `m1===m2 && n1===n2`                       |
| `staticProperty(o1, k1)` vs `staticProperty(o2, k2)` | `o1===o2 && k1===k2`                       |
| `computedProperty(o1)` vs `computedProperty(o2)`     | `o1===o2`                                  |
| `staticProperty(o, *)` vs `computedProperty(o)`      | **yes** — can't tell which key `o[x]` hits |

Object identity is via `Value` reference equality. Two different SSA Values that happen to alias the same runtime object (e.g. `var a = o; var b = o; a.x = 1; b.x = 2`) are conservatively NOT recognized as aliased — our v1 oracle is value-identity-based, not flow-sensitive. This is sound (it just means we optimize less in that case); tighter precision is future work.

### What the oracle is NOT

- **Not** a runtime pointer analysis. It only knows what the IR tells it.
- **Not** type-aware. A string indexed by integer vs object indexed by integer look identical to it.
- **Not** context-sensitive. `o` in one function and `o` in another can never alias because their `Value` IDs differ — which is actually correct for us because we don't inline eagerly.

The oracle is essentially a glorified tag-and-equality check. That's the point. More sophistication can layer on later (heap shapes, type inference feedback) without touching the layers above.

---

## Part 5 — Is this the ideal architecture?

Short answer: **it's the right shape, but some pieces are still scaffolding.** Here's the honest scorecard.

### ✅ Done right

| Aspect                               | Status                                          |
| ------------------------------------ | ----------------------------------------------- |
| Effect signatures on ops             | ✅ MLIR/TurboShaft consensus design             |
| Category-partitioned alias oracle    | ✅ Cranelift pattern, cheap + precise enough    |
| No persistent memory graph           | ✅ avoids LLVM MemorySSA's invalidation problem |
| Stateless queries                    | ✅ transforms never need to update the walker   |
| Foundation for CP / DSE / GVN / LICM | ✅ each can consume this with one helper        |

### ⚠️ Scaffolding — known limitations

1. **Nested region blocks aren't traversed.** The walker only visits top-level blocks of the flat CFG. If your code has an `if` / `while` / `for` body, those nested blocks are effectively invisible — any effectful op inside them is absorbed as "unknown writes" at the structured op's position. That's **sound but coarse**: a load after an `if` block conservatively sees LiveOnEntry for anything the `if` might have touched.
   - **Impact:** CP inside loops, DSE across `if` arms, and LICM don't work well yet.
   - **Fix (Stage 3):** extend the walker's RPO visit into each structured op's nested regions, with join semantics at region exits.

2. **No cross-module reasoning.** `LoadGlobal` always reports `reads: [Unknown]`, even for imports we know are constant (`import { x } from "./other"` where `other.js` has `export const x = 42`).
   - **Impact:** cross-module CP doesn't fold.
   - **Fix (Stage 4):** `ModuleSummary` layer publishes exports with effect signatures; the walker (or a cross-module query helper) reads the summary and narrows `[Unknown]` to `[exported(path, name)]` with a known value.

3. **The walker rebuilds on first query per function.** That's fine today — the top-level region is cheap to walk. But if a single function has many memory-aware passes running, they each pay the first-query cost if we create a fresh walker each pass.
   - **Fix (Stage 5):** cache the walker in `AnalysisManager` like other analyses. Invalidate when the function changes effectful ops.

4. **No escape analysis.** Right now, any object passed to a non-builtin call is treated as "writes escape" (Unknown). A truly ideal compiler would prove `const o = {}; o.x = 1; return o.x;` doesn't leak `o` and inline the field.
   - **Fix (Stage 6+):** separate `EscapeAnalysis` pass consumes the walker; marks escaping objects; feeds back into SROA.

5. **Aliasing precision is value-identity only.** The same underlying object reached via two SSA values looks like two distinct objects to the oracle. In practice our SSA construction keeps values stable through copy propagation, so this rarely hurts, but it's a precision ceiling.
   - **Fix (Stage 7+):** teach the oracle to consult a "points-to" map built by a light flow analysis.

6. **Existing passes don't use it yet.** `ConstantPropagationPass` still does its ad-hoc `forward(place, value)` dance. The walker exists but is unused.
   - **Fix (Stage 2):** migrate CP to `walker.reachingStore`; delete the `exportConstants` special case.

### 🔮 Truly aspirational — maybe never needed

- **Interprocedural analysis** (IPA) across call sites — V8-class, but not urgent for AOT JS.
- **Memory versioning for concurrent reads** — irrelevant to single-threaded JS.
- **Region-based alias trees** (à la CompCert) — formal-methods territory.

---

## Part 6 — Mental model summary

Think of it as three questions, three layers:

> **Q1: What memory does this op touch?**
> A: The op tells you (via `getMemoryEffects`).

> **Q2: Could two labeled memory references overlap?**
> A: The oracle tells you (via `mayAlias`).

> **Q3: What store reaches this load?**
> A: The walker tells you (via `reachingStore`).

Every optimization that cares about memory is built from these three queries. CP answers "Q3 → look up the stored value → substitute." DSE answers "Q3 on every load → is my store ever the answer? No → delete me." GVN answers "Q3 + hash → same answer = same value." LICM answers "Q1 inside loop + Q2 against loop invariants → nothing conflicts → hoist."

None of those passes need to know about each other, or about memory SSA, or about phi nodes, or about invalidation. They just ask Q1/Q2/Q3 and compose.

That's why this is the 2020s consensus architecture: the questions are small, the answers are local, the implementations are independent.

---

## Files to read, in order

1. `src/ir/memory/MemoryLocation.ts` — Layer A (taxonomy)
2. `src/ir/memory/AliasOracle.ts` — Layer C (overlap rules)
3. One effect override, e.g. `src/ir/ops/mem/LoadLocal.ts` — Layer B (self-description)
4. `src/pipeline/analysis/MemoryStateWalker.ts` — Layer D (the walker)
5. `src/pipeline/analysis/MemoryStateWalker.test.ts` — examples in runnable form

Read in this order, top-down. Each layer depends only on the one above. That's the whole architecture.
