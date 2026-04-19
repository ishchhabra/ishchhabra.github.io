# Future Upgrades

Engineering roadmap for the compiler. Items listed are **additive** —
they extend the current architecture, not replace it. Core memory
model (effect signatures + walker + category oracle + summary) is
considered stable.

Sorted by payoff for this project.

---

## 1. Shape / hidden-class inference

**The biggest available win for JS performance.**

Track allocation-site shapes statically. Every `{x, y}` object literal
gets a shape; every `new Foo()` of a specific class does too. Propagate
shapes along dataflow.

Enables:

- `.x`/`.y` lowered to direct slot offsets (no hash lookup in codegen).
- Shape-aware alias oracle: `a.x` and `b.x` alias only if `a` and `b`
  can share a shape that contains `x`.
- Type specialization of arithmetic: `a.x + b.y` → integer add when
  the shape says both fields are int.
- Escape analysis becomes much more precise.

**Cost**: ~months. Research frontier for AOT JS (V8/JSC do it at
runtime with feedback).

**When to invest**: once portfolio (or any target) has a benchmark
that's shape-stable hot code. Pointless until then.

**Refs**:
- V8 hidden classes blog posts
- WebKit structures design doc
- Graal.js shape inference research papers

---

## 2. E-graph for pure-op rewrites (aegraph-style)

**Biggest win for optimization quality.**

Replace our linear pass chain (AlgebraicSimplification → Reassociation
→ CP) for pure ops with an e-graph where equivalent expressions share
a class. At extraction time, cost-based selection picks the best
variant.

Crucially: **complements our current memory/effect system**. Effectful
ops stay in the CFG skeleton (walker governs them). Only pure ops go
in the e-graph. This is exactly what Cranelift's aegraph does.

Unlocks joint-optimal algebraic simplification + CSE + strength
reduction, not sequentially best-effort.

**Cost**: ~months. Non-trivial framework change.

**Refs**:
- Chris Fallin, "The acyclic e-graph: Cranelift's mid-end optimizer"
  https://cfallin.org/blog/2026/04/09/aegraph/
- egg: Fast and Extensible Equality Saturation (POPL 2021)

---

## 3. IPSCCP-style function-return summaries

**Currently covered by inlining** — but there are four edge cases
inlining misses:

1. Recursion (inliner refuses): `function fact(n) { if (...) return 42; return fact(n-1); }`
2. Too large (inline budget rejects): 500-line function, provable const return.
3. Non-inlineable (eval, `arguments`, etc.): but the return is provably const.
4. Cross-module incremental build: summary is much smaller than callee IR.

Extend `ExportSummary` with a `returnValue: LatticeValue` field. On
cross-module call-site evaluation, consult the summary; if const, fold
the call site to a literal.

**Cost**: ~days. Small extension to existing summary layer.

**When to invest**: when cases 1–4 materially bite, or when building
incremental compilation (point 4 becomes load-bearing).

---

## 4. Persistent module summaries for incremental compilation

**For long-term build speed.**

Serialize `ModuleSummary` to disk alongside compiled output.
Cross-session cache: rebuilds only re-analyze changed modules. Shape:
Rust `rmeta`, Swift `.swiftmodule`, TypeScript `.d.ts`.

**Cost**: ~days. Serialization layer; no architecture change.

**When to invest**: when the project gets large enough that rebuild
latency matters.

---

## 5. AnalysisManager caching of the `MemoryStateWalker`

**Query-speed optimization.**

Currently the walker is rebuilt per CP pass invocation. Caching in
`AnalysisManager` with invalidate-on-effectful-op-change would make
repeated queries O(1). Matches LLVM `MemorySSA`'s caching strategy
but without the Updater API — we just invalidate, never incrementally
update.

**Cost**: ~hours. Drop-in.

**When to invest**: once we have ≥3 memory-aware passes (DSE/GVN/LICM
added) competing for walker queries.

---

## 6. Walker descends into nested regions for per-op queries

Current scope-5 walker summarizes nested structured-op effects at the
outer region, but doesn't snapshot ops *inside* nested regions. A pass
that queries `walker.reachingStore(opInsideIf, ...)` gets undefined.

Fix: recursively walk nested regions, building per-op snapshots there
too. Handle join semantics at region exits (if/else merge, loop
back-edges).

**Cost**: ~days. Walker extension.

**When to invest**: when CP/DSE inside loops/conditionals becomes a
measured missed opportunity.

---

## 7. Conditional-executability SCCP (the "C" in SCCP)

Our constant propagation is "value-lattice SCCP" — we don't track
block executability. Adding this (Wegman-Zadeck 1991 full SCCP)
requires:

- Executability lattice per block (executable / unreachable).
- Conditional branches with const test mark one arm unreachable.
- Canonicalizer pass to collapse dead arms into the taken region.

Unlocks folding through `if (const) { … }` patterns.

**Cost**: ~days. Well-understood algorithm; canonicalizer is the
majority of the work.

**When to invest**: when post-CP benchmarks show unreachable-branch
code surviving.

---

## 8. Write DSE (Dead Store Elimination)

Memory-aware DCE: delete stores whose written cell is never read
before being overwritten. Pure walker consumer — uses
`walker.reachingStore` in reverse (what reads observe this store?).

**Cost**: ~400 LOC new pass.

**Refs**:
- LLVM `DeadStoreElimination.cpp`
- TurboShaft `LateStoreStoreEliminationReducer`

---

## 9. Write GVN (Global Value Numbering) on loads

Deduplicate redundant loads when the same cell hasn't been written
between them. Walker consumer.

**Cost**: ~500 LOC new pass.

**Refs**:
- LLVM `GVN.cpp` (note: their design is overkill for JS)
- Click 1995, "Global Code Motion / Global Value Numbering"

---

## 10. Write LICM (Loop-Invariant Code Motion)

Hoist loop-invariant loads and expressions out of loop bodies. Walker
consumer: a load is loop-invariant iff no store in the loop body
aliases its read location.

**Cost**: ~500 LOC new pass.

**Refs**:
- LLVM `LICM.cpp`
- LLVM `LoopInfoAnalysis` (we already have the equivalent)

---

## Not doing (for stated reasons)

- **Persistent MemorySSA overlay graph**: rejected architecturally
  (see `docs/memory-model.md`). Maintenance cost doesn't pay off for
  JS AOT at any scale.
- **Speculative optimizations with deopt guards**: requires runtime
  support we don't have (AOT emits JS source, no deopt mechanism).
  If we ever add a JIT tier, layer speculation on top.
- **Sea-of-Nodes IR**: V8 and others explicitly moved away. We stay
  on block-CFG + structured regions.
- **Function specialization / cloning per const arg**: inlining +
  CP covers the useful cases without the code-size blowup.
