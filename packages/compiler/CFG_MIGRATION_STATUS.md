# CFG Migration Status

## Context

The compiler is migrating from MLIR-inspired structured-op IR (regions, `RegionBranchOp`) to flat CFG with structured-terminator-kind metadata (React Compiler / Cranelift / Turboshaft pattern). This is a multi-week architectural rewrite being done on branch `refactor/cfg-pivot`.

Rationale and decision notes: see conversation history and the independent agent reports that concurred on the pivot.

## Current state

Branch: `refactor/cfg-pivot`

Commits so far (base: `709f31a6` on main):

| Commit | What |
|---|---|
| `b54a80bd` | Four compiler bug fixes (cherry-picked to main). CP BOTTOM on walker miss, VMP D2, ForOf/ForIn inits, SSABuilder resultPlaces. |
| `78f8f1bf` | Additive: new CFG-style terminator classes (IfTerm, WhileTerm, ForTerm, ForOfTerm, ForInTerm, TryTerm, SwitchTerm, LabeledTerm). |
| `331c680b` | Rewrite every HIR builder to emit flat CFG + structured terminators instead of region-owning structured ops. |
| `6aa3c3bf` | Type-clean the wiring; export new terminators; fix JumpOp arg types. |

## Measurable state

- **Type-check**: clean (4 pre-existing test errors unrelated)
- **Build**: succeeds
- **Tests**: 416 passing / 585 total (71%)
- **Portfolio verify**: not attempted since frontend change

## Done

Frontend — every HIR builder emits flat CFG with new terminators:

- `buildIfStatement` → IfTerm
- `buildWhileStatement` → WhileTerm (kind=while)
- `buildDoWhileStatement` → WhileTerm (kind=do-while)
- `buildForStatement` → ForTerm
- `buildForOfStatement` → ForOfTerm
- `buildForInStatement` → ForInTerm
- `buildTryStatement` → TryTerm
- `buildSwitchStatement` → SwitchTerm
- `buildLabeledStatement` → LabeledTerm
- `buildBlockStatement` → plain Jump to body block
- `buildConditionalExpression` → IfTerm with join-block block-arg
- `buildLogicalExpression` → IfTerm with join-block block-arg
- `buildAssignmentExpression` (logical assignment arms) → IfTerm with join-block block-arg

New blocks are added as siblings in the enclosing region (usually `funcOp.body`) rather than owned by a region of a structured op. SSA merges go through block parameters on successor blocks — no YieldOp, no iter-args, no resultPlaces.

## Not done (in order to close the loop)

### 1. Codegen rewrite — the biggest remaining chunk (~1000 lines)

`src/backend/codegen/structures/*` currently contains one generator per old structured op:

- `generateIfStructure.ts` (154 lines) — reads `IfOp.consequentRegion`/`alternateRegion`/`resultPlaces`
- `generateWhileStructure.ts` (192 lines) — reads `WhileOp.beforeRegion`/`bodyRegion`
- `generateForStructure.ts` (254 lines) — reads `ForOp.initRegion`/`beforeRegion`/`bodyRegion`/`updateRegion`
- `generateForOfStructure.ts`, `generateForInStructure.ts` (57 lines each)
- `generateTryStructure.ts` (45 lines)
- `generateSwitchStructure.ts` (75 lines)
- `generateLabeledBlockStructure.ts`, `generateBlockStructure.ts`
- `generateStructure.ts` (62 lines, dispatcher)

All of these are dead code after the pivot — the frontend doesn't emit structured ops anymore. Need to replace with terminator-driven emission:

- **IfTerm** → `if (cond) { genBlock(then) } else { genBlock(else) }`. Ternary recognition: if fallthrough block has one block-param used as a value and both arms are simple jumps carrying a value, emit `cond ? val1 : val2`.
- **WhileTerm** → walk header's test ops, then `while (cond) { genBlock(body) }` / `do { genBlock(body) } while (cond)` based on `kind`.
- **ForTerm** → init ops live in the pre-header block; emit `for (init; cond; update) { genBlock(body) }`.
- **ForOfTerm** → `for (const iterVal of iterable) { genBlock(body) }`.
- **ForInTerm** → `for (const iterVal in object) { genBlock(body) }`.
- **TryTerm** → `try { genBlock(body) } catch (e) { genBlock(handler) } finally { genBlock(finally) }`.
- **SwitchTerm** → `switch (disc) { case X: genBlock(caseBlock); ... default: genBlock(default) }`.
- **LabeledTerm** → `label: { genBlock(body) }`.

Block-walker needs to track "which blocks have already been visited as the body of a structured terminator" so they're not re-emitted at the function level. See React Compiler's `codegenFunction` / `codegenBlock` for the pattern — they track a "visited blocks" set + a "structured terminator bodies" map.

### 2. SSABuilder simplification (~500 lines removable)

`src/pipeline/ssa/SSABuilder.ts` has entire subsystems that are dead after the pivot:

- `renameRegionBranchOp` (~200 lines) — deletes
- Memory-form snapshot/restore for TryOp/SwitchOp/BlockOp/LabeledBlockOp — deletes
- Iter-args machinery for WhileOp/ForOp/ForOfOp/ForInOp/LabeledBlockOp — no longer needed; loop-carried values flow through regular block params on the loop header
- `loopContexts` tracking — still needed for labeled break/continue

What remains: textbook Cytron IDF + rename over the flat CFG.

### 3. SSAEliminator simplification (~150 lines removable)

`src/pipeline/ssa/SSAEliminator.ts`:
- Delete op-result sinks (no more `resultPlaces` on structured ops)
- Delete region-entry-param sinks (no more structured ops owning regions)
- Keep: plain block-param sinks, decl placement, per-edge copy stores

### 4. MemoryStateWalker simplification (~80 lines removable)

`src/pipeline/analysis/MemoryStateWalker.ts`:
- Delete `collectNestedWrites` (no regions to walk into)
- Delete the `HasRegions` branch in `applyOpToState`
- `reversePostOrder` becomes a standard flat-CFG walk — no special handling

### 5. PromotabilityAnalysis simplification

`src/pipeline/ssa/PromotabilityAnalysis.ts`:
- Remove `NestedInMemoryFormOp` reason — no more memory-form ops
- The specific check that marked bindings as non-promotable because they lived inside TryOp/SwitchOp/BlockOp is now obsolete; those blocks are in the function body's flat CFG and directly visible to mem2reg

### 6. Passes

Every pass that `instanceof IfOp` / `instanceof WhileOp` / etc. needs updating. Grep reveals ~56 files. Most references will simply become dead code. For passes that need to reason about loop structure (LICM, LoopInfoAnalysis, etc.), the work is to recognize loops from back-edges in the flat CFG — `LoopInfoAnalysis.ts` already mostly does this.

Files to touch:
- `src/pipeline/analysis/LivenessAnalysis.ts`
- `src/pipeline/analysis/MemoryStateWalker.ts`
- `src/pipeline/analysis/MutabilityAnalysis.ts`
- `src/pipeline/analysis/LoopInfoAnalysis.ts`
- `src/pipeline/passes/ConstantPropagationPass.ts`
- `src/pipeline/passes/DeadCodeEliminationPass.ts`
- `src/pipeline/passes/ValueMaterializationPass.ts`
- `src/pipeline/passes/FunctionInliningPass.ts`
- `src/pipeline/passes/ExpressionInliningPass.ts`
- `src/pipeline/passes/CapturePruningPass.ts`
- ... (see `grep -rl "IfOp\|TryOp\|SwitchOp\|WhileOp\|ForOp\|ForOfOp\|ForInOp\|LabeledBlockOp\|BlockOp\b" src/pipeline/`)

### 7. Delete old structured op classes

After #1–#6:
- `src/ir/ops/control/Try.ts` → delete
- `src/ir/ops/control/Switch.ts` → delete
- `src/ir/ops/control/If.ts` → delete
- `src/ir/ops/control/While.ts` → delete
- `src/ir/ops/control/For.ts` → delete
- `src/ir/ops/control/ForOf.ts` → delete
- `src/ir/ops/control/ForIn.ts` → delete
- `src/ir/ops/control/LabeledBlock.ts` → delete
- `src/ir/ops/control/Block.ts` → delete
- `src/ir/core/Region.ts` → delete (once `Operation.regions` is gone)
- `src/ir/core/RegionBranchOp.ts` → delete
- `src/ir/core/LoopLikeOpInterface.ts` → delete (or keep as a pure analysis concept over CFG back-edges)
- `Trait.HasRegions` → delete from `Operation.ts`

### 8. FuncOp restructure

`src/ir/core/FuncOp.ts`:
- Replace `regions[0]` (body Region) with a direct flat `blocks: BasicBlock[]`
- Drop the two-phase clone protocol (phase-1 non-region ops, phase-2 region-owning ops) — not needed without regions
- `allBlocks()` becomes trivial flat iteration
- `getBlock(id)` can become O(1) via a flat map

### 9. Fixture regeneration

585 test fixtures. After codegen is rewritten, running `UPDATE_FIXTURES=1 pnpm test` regenerates all `output.js` fixtures. Then audit the diff manually for correctness (the new CFG codegen should emit semantically-equivalent JS but may differ in formatting details like block-scope bracing and variable naming).

### 10. Portfolio verify

Run `verify-compiler-on-portfolio` skill end-to-end: `AOT_NODE_MODULES=1 pnpm aot:compile` → `ENABLE_AOT=1 pnpm build` → serve → navigate in Chrome → check console errors across home, `/writing/*`, `/lab/*`, `/demos/*`, `/debug/*`.

## Suggested next-session order

1. **Codegen** — start with `IfTerm` (simplest; enables most passing tests). Then loops (WhileTerm, ForTerm). Then TryTerm/SwitchTerm. LabeledTerm last. Aim: 585/585 passing tests.
2. **SSA cleanup** — simplify SSABuilder / SSAEliminator / Liveness. Will expose dead code paths; delete them aggressively.
3. **Passes** — grep for remaining `IfOp` / `TryOp` / etc. references; each is a small edit.
4. **Delete** — drop the old op classes and Region.
5. **Portfolio verify** — end-to-end sanity.

Each numbered step is roughly one focused session.
