# Full-SSA-for-Scalars: Post-Mortem

## Summary

Attempted full SSA promotion (mem2reg) for function-local scalars.
After multiple attempts across several sessions, concluded this is not
responsibly doable in a short timeframe. Reverted to the
walker-based memory-form architecture. Documenting what was learned
so a future attempt can start from stronger footing.

## What was tried

Each attempt made a small change, tests mostly passed, then
integration revealed the next cascading issue. The sequence:

1. **SSABuilder mem2reg**: push stored values (not lvals) onto the
   rename stack for non-captured, non-context locals. Elide
   LoadLocal for promoted bindings; apply load-forwards globally at
   end of SSA construction.
2. **Capture detection**: exclude bindings captured by nested
   functions from promotion. Prevents a bug where captured Values
   in `ArrowFunctionExpressionOp.captures` get rewritten to specific
   stored values — e.g., embedding `await $x` into a non-async
   closure body.
3. **StoreLocal always side-effectful**: both declaration and
   assignment kinds. Needed because mem2reg elides LoadLocals and
   the declaration's place then has no SSA users — DCE would delete
   it, breaking source-level binding existence for destructure
   targets, property writes, etc.
4. **CP evaluateLoadLocal walker refinement**: on each LoadLocal for
   a promotable binding, consult the walker for the reaching store.
   If a unique `StoreLocalOp` reaches, forward from its value; else
   fall back to the cell's meet lattice.
5. **ExportDefaultDeclaration.rewrite fix**: the op had a no-op
   `rewrite()` method, so `applyLoadForwards`'s global pass couldn't
   reach it. Real bug, independent of SSA, now fixed and shipped.
6. **generateForStructure mixed case**: handle the case where SSA
   elimination's iter-arg copy stores coexist with hoisted `var`
   declarators in a for-loop's init region. Real bug, now fixed and
   shipped.
7. **Destructure exclusion**: add `complexWrittenDeclIds` — any
   binding written by an op other than simple `StoreLocalOp`
   (destructures, for-of / for-in iteration vars, catch params,
   parameter patterns). Exclude these from promotion; they stay
   memory-form.
8. **Destructure memory effects**: `ArrayDestructureOp` /
   `ObjectDestructureOp` need to declare their binding-target
   writes in `getMemoryEffects()` so the walker sees them as
   writers. Without this, walker-based CP folds reads of
   destructured bindings to the binding's pre-destructure value.
9. **`destructureTargetHasObservableWrites` fix**: previously
   returned `false` for local bindings, relying on DCE keeping the
   op alive via LoadLocal users. Post-mem2reg those users don't
   exist; need to return `true` for all bindings.

## Where it broke (final blocker)

After all the fixes above, a simple example produced wrong output
when the full optimizer pipeline ran:

```js
// input
let a, b, c, d;
[[a, b], [c, d]] = [[1, 2], [3, 4]];
console.log(a, b, c, d);

// output (with full pipeline, broken)
[[$0, $1], [$2, $3]] = [[1, 2], [3, 4]];
console.log(undefined, undefined, undefined, undefined);
```

Without the optimizer, output was correct. With any single optimizer
pass enabled individually, output was correct. With all enabled,
reads fold to `undefined`. The cascade required three or more
passes working together; I couldn't isolate the interaction in the
time budgeted for this session.

The walker-based CP was setting `BOTTOM` on the loads (verified via
trace print). Some downstream pass was still substituting the reads
with the initial declaration's `undefined` value. Candidates:
`ExpressionInliningPass` (unlikely — it respects mutable state),
`LateCopyPropagationPass` (more likely — may have its own
store-to-load forwarding that doesn't consult the walker),
`ScalarReplacementOfAggregatesPass` (works on the destructure's
RHS array). Diagnosing which, and fixing it soundly, needs time I
did not have.

## Why this is a multi-session project (not a one-day hack)

A correct full-SSA-for-scalars migration touches:

1. **IR shape**: StoreLocal's role becomes different — it's no
   longer the canonical write op for promoted bindings. What about
   destructure, for-of, catch? Their writes need SSA representation
   (multi-result ops, per-write fresh Values, or exclusion).
2. **Mutability analysis**: needs to count *all* writers to a
   binding, not just `StoreLocalOp`/`StoreContextOp`. Destructure,
   for-of, catch all write bindings and affect mutability.
3. **Dead-code elimination**: SSA liveness ≠ source-level binding
   liveness. Declarations with no SSA users must still be preserved
   because subsequent destructures / property writes target their
   cell. Today's DCE uses SSA liveness.
4. **Dead-store elimination**: needs memory-aware reasoning. With
   mem2reg, the "is this store dead?" question requires the walker,
   not def-use chains. We don't have DSE yet.
5. **Expression inlining**: its `readsMutableState` check uses
   `MutabilityAnalysis.getStoreCount`, which doesn't count
   destructures. When mem2reg removes the "mutable" hint (no
   LoadLocal readers), the inliner may inline a stale value.
6. **Late copy propagation**: needs retrofitting to understand that
   a binding written by destructure isn't a simple copy source.
7. **Codegen**: for destructure, for-of, catch, the composite op
   must reconstruct from multi-result Values. Or lower to iterator
   protocol (huge output size penalty).
8. **Fixture sweep**: ~200 fixtures affected, each needing manual
   review for whether the new output is semantically equivalent.

Any **one** of these landing wrong causes silent miscompilation —
code that runs but produces the wrong answer. The portfolio's
ReactiveFlags bug earlier in this arc was exactly this kind of
failure: the compiler produced an output that looked plausible but
was wrong.

## What to do instead

**The walker-based memory-form architecture (what we have today) is
the right answer for JS AOT.** Evidence:

- Every production JS compiler (TurboShaft, SWC, Oxc, Closure,
  Babel output-preserving mode, React Compiler) stays memory-form
  for mutable bindings.
- Only LLVM does mem2reg — and LLVM's source languages (C, C++,
  Rust) don't have composite destructure ops. LLVM never sees a
  multi-def op; source-level lowering has already reduced it to
  individual stores.
- JS AOT outputs JS source — we can't lower destructure to iterator
  protocol without blowing up output size and runtime cost.
- Our walker gives path-sensitive reaching-def precision equivalent
  to what mem2reg delivers for simple cases. The benefit of mem2reg
  is cognitive (cleaner IR dumps), not correctness or precision.

## What WAS salvaged

Two genuinely useful bug fixes, orthogonal to SSA, were discovered
during this work and are staged:

1. `ExportDefaultDeclaration.rewrite()` now properly substitutes
   its `declaration` operand instead of being a no-op. This was a
   latent bug — any global IR rewrite that produced a substitution
   for an export-default's declaration would silently fail.
2. `generateForStructure`'s mixed init-region case (hoisted
   declarators + SSA-eliminator iter-arg expressions) now emits a
   block wrapper instead of throwing. This was a known-unimplemented
   path ("Update handling if this fires.") that's now handled.

## Paths forward, ranked

### 1. Stay memory-form (recommended)

- No action needed. Walker + category-partitioned alias oracle +
  ModuleSummary is the architecturally-correct design for JS AOT.
- Builds DSE / GVN / LICM on top of the walker when ready.
- Matches every production JS compiler.

### 2. Lower destructure (Path 2)

- ~400-600 LOC lowering pass: `ArrayDestructureOp` → iterator
  protocol calls + individual stores; `ObjectDestructureOp` →
  property access + individual stores.
- Output size grows significantly. Runtime performance drops for
  destructure-heavy code.
- Only historical precedent: Babel targeting ES5. Nobody does this
  for modern JS.

### 3. Multi-result ops (Path multi-result)

- ~1000-1500 LOC: add IR support for ops with multiple SSA results,
  MLIR-style. Destructure ops produce N result Values; reads
  reference specific targets. Codegen emits composite syntax.
- Novel for JS — no production compiler has done this.
- 1-2 weeks of careful work with extensive fixture verification.

### 4. Revisit SSA when building a new mid-end

- If at some point we build a new mid-end (e.g., an e-graph like
  Cranelift), that's a natural point to reconsider the SSA question.
- At that point, the IR rebuild makes it cheap to also promote
  scalars.

## Detailed findings catalog

### Findings about our IR

- `Value.declarationId` is a stable source-binding identity; the
  same Value is reused across all writes to a source variable in
  some contexts (destructure targets, `getDeclarationBinding()`).
  Full SSA requires fresh Values per write.
- `StoreLocalOp.lval` is shared across all stores to the same
  binding (by design, matches memory semantics). For full SSA, each
  store's lval would need to be unique.
- `MutabilityAnalysis` counts only `StoreLocalOp` / `StoreContextOp`
  — not destructure / for-of / catch.
- `destructureTargetHasObservableWrites` returns `false` for local
  bindings, relying on memory-form's LoadLocal users to keep the
  destructure alive.
- Several ops have `rewrite(): Operation { return this; }` — they
  ignore the substitution map. Most are correct (no operands to
  rewrite) but `ExportDefaultDeclarationOp` had operand
  `this.declaration` and still ignored — fixed.

### Findings about our passes

- `ConstantPropagationPass.evaluateLoadLocal` fallback path uses
  `forward(op.place, op.value)` — reads the lval's meet-combined
  lattice. Under mem2reg, the lval's lattice reflects only
  `StoreLocalOp` writers (via `evaluate(StoreLocalOp)`'s
  `forward(op.lval, op.value)`). Destructure writers don't
  contribute.
- `DeadCodeEliminationPass` deletes ops whose result has no SSA
  users unless the op is side-effectful. Under mem2reg, this kills
  declaration stores whose LoadLocals have been elided. Fix:
  declarations become side-effectful (with DSE as the future
  removal mechanism).
- `ExpressionInliningPass.readsMutableState` returns false for
  single-store locals. Destructure targets appear single-store to
  MutabilityAnalysis, so the inliner may inline their pre-
  destructure value incorrectly.

### Findings about our frontend

- `buildLVal.ts` reuses `environment.getDeclarationBinding(declId)`
  for every destructure target write. Each write to a source-level
  variable produces the same Value.
- `buildIdentifierBindings` creates one Value per source identifier
  per scope. Reassignments all share the same binding Value.
- These were originally correct for memory-form (one cell per
  binding). Full SSA requires per-write fresh Values.

### Production comparison

| Compiler | Mem2reg for scalars? | Handles destructure via |
|---|---|---|
| LLVM | Yes, aggressively | Source lowering removes before LLVM sees |
| V8 TurboShaft | No | Composite op, memory-form |
| Cranelift | No | Composite op, memory-form |
| React Compiler | No | Composite op, memory-form |
| Babel / SWC / Oxc | No | Composite op (or ES5 lowering) |
| GCC | Yes, aggressively | Source lowering |
| Our compiler | No (final choice) | Composite op, walker handles reads |

## The architectural principle

SSA and memory-form are not "better" vs "worse" — they're choices
with different trade-offs. The choice depends on what you can
lower and what your output looks like:

- **Can lower all multi-def writes to single-def stores + accept
  the output cost**: mem2reg works. LLVM, GCC, Rust.
- **Cannot lower (or don't want to)**: memory-form works.
  TurboShaft, Cranelift, React Compiler, every JS-source-preserving
  compiler.

For JS AOT outputting JS source: memory-form is the established
answer.

## Open questions if we revisit

1. Is there any JS benchmark where mem2reg's O(1) definer walks
   provide a *measurable* performance advantage over the walker's
   per-query cost?
2. Would a narrower mem2reg (single-assignment `const` bindings
   only) be feasible without the cascading issues?
3. What's the minimum multi-result IR change that could support
   destructure without breaking codegen output? (Projection nodes
   a la HotSpot C2 might be simpler than MLIR-style multi-result.)

These are questions for a future investigation, not this session.
