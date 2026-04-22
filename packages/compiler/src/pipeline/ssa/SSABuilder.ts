import {
  Operation,
  BasicBlock,
  BlockId,
  DeclarationId,
  Value,
  LiteralOp,
  LoadLocalOp,
  makeOperationId,
  StoreLocalOp,
} from "../../ir";
import { FuncOp } from "../../ir/core/FuncOp";
import { ModuleIR } from "../../ir/core/ModuleIR";
import { Trait } from "../../ir/core/Operation";
import { Region } from "../../ir/core/Region";
import { collectDestructureTargetBindingPlaces } from "../../ir/core/Destructure";
import {
  BreakOp,
  ContinueOp,
  ForInOp,
  ForOfOp,
  ForOp,
  isStructure,
  JumpOp,
  LabeledBlockOp,
  WhileOp,
} from "../../ir/ops/control";
import { AnalysisManager } from "../analysis/AnalysisManager";
import { PromotabilityAnalysis } from "./PromotabilityAnalysis";
import { DominatorTreeAnalysis, type DominatorTree } from "../analysis/DominatorTreeAnalysis";
import { createParamValue } from "./utils";
import {
  isRegionBranchOp,
  isRegionBranchTerminator,
  parentExit,
  type RegionBranchOp,
} from "../../ir/core/RegionBranchOp";
import { isLoopLike } from "../../ir/core/LoopLikeOpInterface";

type Stacks = Map<DeclarationId, Value[]>;

/**
 * Textbook SSA construction (Cytron et al., 1991), adapted to an
 * MLIR-style structured-region IR.
 *
 * Two layers of SSA co-exist:
 *
 *   1. **Flat block-param SSA**, for any flat CFG inside a region.
 *      Block parameters are placed at iterated dominance frontiers,
 *      and the rename phase walks the dominator tree in pre-order
 *      with push-at-entry / pop-at-exit discipline.
 *
 *   2. **Structured-op port SSA**, for values that need to cross a
 *      structured op's region boundary. Any op that implements
 *      MLIR's {@link RegionBranchOp} interface (see
 *      {@link RegionBranchOp}) participates in a generic iter-args
 *      lowering driven by {@link renameRegionBranchOp}. The builder
 *      consumes only two interfaces:
 *
 *        - {@link RegionBranchOp} on the structured op: declares
 *          the region-branch CFG via `getSuccessorRegions(point)`
 *          and the Parent-point operand source via
 *          `getEntrySuccessorOperands(succ)`. The builder derives
 *          prelude regions, cycle regions, and carried-decl sets
 *          from this CFG alone — no per-op class in the builder.
 *
 *        - {@link RegionBranchTerminator} on terminators (`YieldOp`,
 *          `ConditionOp`, `BreakOp`, `ContinueOp`): exposes the
 *          forwarded-operand slice and a rebuild-with-new-operands
 *          hook. The builder appends carried tops at each terminator
 *          in a region via `setForwardedOperands(...)`.
 *
 *      Shipped today: {@link IfOp}, {@link WhileOp}, {@link ForOp},
 *      {@link ForInOp}, {@link ForOfOp}, {@link LabeledBlockOp}.
 *
 *      Ops that don't implement the interface (try/switch/block)
 *      carry state through memory form. The rename snapshots
 *      stacks on region entry and restores on exit; mutations
 *      survive as StoreLocals and are materialized as `let`
 *      assignments by codegen.
 *
 * ## Mem2Reg
 *
 * Fused into rename. For every source-level binding that
 * {@link PromotabilityAnalysis} classifies as promotable:
 *
 *   - Each {@link StoreLocalOp} on the binding pushes its *rhs value*
 *     (not its lval) onto the rename stack and is deleted in place.
 *     Subsequent reads of the binding resolve to that rhs value via
 *     the stack.
 *
 *   - Each {@link LoadLocalOp} on the binding is elided: the load's
 *     place is recorded in {@link rewrites} as an alias for the
 *     reaching value (the current stack top), and the op is deleted.
 *
 *   - Every later op whose operand references an elided load's place
 *     is rewritten through {@link rewrites} the first time rename
 *     visits it (inside {@link buildRewriteMap}).
 *
 * **Invariant:** values stored in the {@link rewrites} map and on
 * rename stacks are always *terminal* — they are not themselves
 * aliased. This holds because we resolve through the stack (which
 * holds terminals) at elision time, and never push a load's place
 * onto a stack. Consequently, no transitive chasing is required.
 *
 * Top-level regions use a proper dom-tree rename walk. Structured-
 * op regions use a linear walk (program order) with region-scoped
 * push accumulation — the arms produced by the HIR builder are
 * typically single-block, and the linear walk is equivalent to the
 * dom-tree walk in that case. Multi-block arms appear only when an
 * arm contains `break` / `continue` / `return` that diverts control;
 * those arms don't participate in the value-merge anyway because
 * their last block is not a YieldOp.
 *
 * References:
 *   - Cytron et al. 1991, "Efficiently Computing Static Single
 *     Assignment Form and the Control Dependence Graph".
 *   - LLVM `PromoteMemoryToRegister.cpp` (mem2reg).
 */
export class SSABuilder {
  private readonly funcOp: FuncOp;
  private readonly moduleIR: ModuleIR;
  private readonly AM: AnalysisManager;

  private undefSeed!: Value;
  private domTree!: DominatorTree;
  private readonly blockRegion = new Map<BlockId, Region>();
  private readonly domTreeChildren = new Map<BlockId, BlockId[]>();

  /**
   * Mem2reg alias map: for every elided {@link LoadLocalOp}, records
   * `load.place → reaching value`. Consulted by
   * {@link buildRewriteMap} when rewriting operands of subsequent
   * ops. Values in this map are always terminal (see class docs'
   * invariant), so no transitive resolution is required at lookup.
   */
  private readonly rewrites = new Map<Value, Value>();

  /**
   * Which declarations may be promoted out of memory form. Set in
   * {@link build} before rename; consulted inside {@link renameFlatOp}
   * to decide whether to elide a StoreLocal/LoadLocal.
   */
  private promotability!: PromotabilityAnalysis;

  /**
   * Stack of enclosing loop contexts, pushed/popped around body
   * renames. Break/Continue terminators inside a body consult this
   * stack (matching by label, or innermost unlabeled) to find which
   * loop's iter-args they must fill.
   */
  private readonly loopContexts: Array<{
    op: WhileOp | ForOp | ForInOp | ForOfOp | LabeledBlockOp;
    label: string | undefined;
    carriedDecls: readonly DeclarationId[];
  }> = [];

  constructor(funcOp: FuncOp, moduleIR: ModuleIR, AM: AnalysisManager) {
    this.funcOp = funcOp;
    this.moduleIR = moduleIR;
    this.AM = AM;
  }

  public build(): void {
    const stacks: Stacks = new Map();
    this.undefSeed = this.materializeUndefSeed();
    this.promotability = new PromotabilityAnalysis(this.funcOp, this.moduleIR);
    this.seedHeaderDefinitions(stacks);

    // Value block params at iterated dominance frontiers for the
    // flat CFG of the top-level region. Most JS functions end up
    // with a single body block after the frontend emits structured
    // ops, so this is usually a no-op — but multi-block regions
    // still benefit from Cytron's placement.
    this.placeBlockParams();

    this.indexBlockRegions();
    this.domTree = this.AM.get(DominatorTreeAnalysis, this.funcOp);
    this.computeDomTreeChildren();

    // Textbook rename: dom-tree pre-order walk, starting at the
    // function entry block within the body region. Mem2reg is fused
    // into this walk — promoted StoreLocal/LoadLocal ops are deleted
    // as they are visited; later uses resolve through the stack and
    // the {@link rewrites} alias map. When this returns, the IR is
    // well-formed SSA.
    this.renameBlockDomTree(this.funcOp.entryBlock, stacks);
  }

  // ---------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------

  /**
   * Create a single `LiteralOp(undefined)` at the start of the entry
   * block. Used as the function-wide undef seed when a block param
   * has no reaching definition on some incoming edge.
   */
  private materializeUndefSeed(): Value {
    const env = this.moduleIR.environment;
    const place = env.createValue();
    const opId = makeOperationId(env.nextOperationId++);
    const literal = new LiteralOp(opId, place, undefined);
    const entryBlock = this.funcOp.getBlock(this.funcOp.entryBlockId);
    entryBlock.insertOpAt(0, literal);
    return place;
  }

  /**
   * Seed stacks from the function header. Every parameter binding,
   * prologue-defined place, and header-defined place is pushed onto
   * its declaration's rename stack so body reads see a reaching def
   * from the start.
   */
  private seedHeaderDefinitions(stacks: Stacks): void {
    for (const place of this.funcOp.params) {
      this.pushStack(stacks, place);
    }
    for (const pattern of this.funcOp.paramPatterns) {
      for (const place of collectDestructureTargetBindingPlaces(pattern)) {
        this.pushStack(stacks, place);
      }
    }
    for (const instr of this.funcOp.prologue) {
      if (instr instanceof StoreLocalOp) {
        for (const place of instr.getDefs()) {
          this.pushStack(stacks, place);
        }
      } else if (instr.place) {
        this.pushStack(stacks, instr.place);
      }
    }
  }

  /**
   * Build a block-id → owning-region index. Used by the dom-tree
   * rename walk to keep recursion within a region's own blocks (a
   * block dominated by the entry can live in a nested structured
   * op's region, and nested regions are processed via the
   * structured-op handler, not via the outer dom-tree walk).
   */
  private indexBlockRegions(): void {
    const visit = (region: Region): void => {
      for (const block of region.blocks) {
        this.blockRegion.set(block.id, region);
        for (const op of block.operations) {
          if (op.hasTrait(Trait.HasRegions)) {
            for (const nested of op.regions) visit(nested);
          }
        }
      }
    };
    visit(this.funcOp.body);
  }

  private computeDomTreeChildren(): void {
    for (const [child, idom] of this.domTree.getImmediateDominators()) {
      if (idom === undefined) continue;
      let children = this.domTreeChildren.get(idom);
      if (children === undefined) {
        children = [];
        this.domTreeChildren.set(idom, children);
      }
      children.push(child);
    }
  }

  // ---------------------------------------------------------------------------
  // Block-param placement (Cytron IDF, top-level region only)
  // ---------------------------------------------------------------------------

  private placeBlockParams(): void {
    const topLevelBlockIds = new Set<BlockId>();
    for (const block of this.funcOp.body.blocks) {
      topLevelBlockIds.add(block.id);
    }
    if (topLevelBlockIds.size <= 1) return;

    const domTree = this.AM.get(DominatorTreeAnalysis, this.funcOp);

    for (const [declId, entries] of this.moduleIR.environment.declToValues) {
      if (this.moduleIR.environment.contextDeclarationIds.has(declId)) continue;

      const defBlocks = entries
        .filter((e) => topLevelBlockIds.has(e.blockId))
        .map((e) => e.blockId);
      if (defBlocks.length <= 1) continue;

      this.placeParamsForDeclaration(declId, defBlocks, domTree);
    }
  }

  private placeParamsForDeclaration(
    declId: DeclarationId,
    defBlocks: BlockId[],
    domTree: DominatorTree,
  ): void {
    const worklist = [...defBlocks];
    const hasParam = new Set<BlockId>();
    const defSet = new Set(defBlocks);

    while (worklist.length > 0) {
      const block = worklist.pop()!;
      for (const frontier of domTree.getDominanceFrontier(block)) {
        if (hasParam.has(frontier)) continue;

        const id = createParamValue(this.moduleIR.environment);
        id.originalDeclarationId = declId;
        const place = id;

        const frontierBlock = this.funcOp.getBlock(frontier);
        frontierBlock.params = [...frontierBlock.params, place];
        hasParam.add(frontier);

        if (!defSet.has(frontier)) {
          defSet.add(frontier);
          worklist.push(frontier);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Top-level rename — proper dom-tree walk with per-block push/pop
  // ---------------------------------------------------------------------------

  /**
   * Textbook Cytron rename for the top-level region. Pushes block
   * params at block entry, rewrites every op in program order, fills
   * edge args on the terminator, recurses into dom-tree children
   * that share this block's region, then pops everything pushed in
   * this block.
   */
  private renameBlockDomTree(block: BasicBlock, stacks: Stacks): void {
    const pushed: DeclarationId[] = [];

    for (const binding of block.entryBindings) {
      this.pushStack(stacks, binding, pushed);
    }
    for (const param of block.params) {
      if (param.originalDeclarationId !== undefined) {
        this.pushStack(stacks, param, pushed);
      }
    }

    for (let i = 0; i < block.operations.length; i++) {
      const op = block.operations[i];
      if (op.hasTrait(Trait.HasRegions)) {
        this.renameStructuredOp(block, i, op, stacks, pushed);
        continue;
      }
      const advance = this.renameFlatOp(op, block, i, stacks, pushed);
      if (advance === "rewind") i--;
    }

    if (block.terminal !== undefined) {
      this.renameOpOperands(block.terminal, stacks);
      if (block.terminal instanceof JumpOp) {
        this.fillJumpArgs(block, block.terminal, stacks);
      }
    }

    const currentRegion = this.blockRegion.get(block.id);
    const children = this.domTreeChildren.get(block.id);
    if (children !== undefined) {
      for (const childId of children) {
        if (this.blockRegion.get(childId) === currentRegion) {
          this.renameBlockDomTree(this.funcOp.getBlock(childId), stacks);
        }
      }
    }

    this.popPushed(stacks, pushed);
  }

  /**
   * Rewrite the operands of `op` through the current rename stacks.
   */
  private renameOpOperands(op: Operation, stacks: Stacks): void {
    const rewriteMap = this.buildRewriteMap(op.getOperands(), stacks);
    if (rewriteMap.size === 0) return;
    const rewritten = op.rewrite(rewriteMap);
    if (rewritten === op) return;
    const parent = op.parentBlock;
    if (parent === null) return;
    parent.replaceOp(op, rewritten);
  }

  // ---------------------------------------------------------------------------
  // Structured-op rename — linear walk inside regions
  // ---------------------------------------------------------------------------

  /**
   * Dispatch a structured op to the right handler. The op's operands
   * are rewritten first (through the current stacks). The handler
   * then walks each nested region, captures any cross-region state
   * it needs, and pushes the op's result defs onto the parent
   * rename stack.
   */
  private renameStructuredOp(
    parentBlock: BasicBlock,
    opIndex: number,
    op: Operation,
    stacks: Stacks,
    parentPushed: DeclarationId[],
  ): void {
    this.renameOpOperands(op, stacks);
    const currentOp = parentBlock.operations[opIndex];

    // Generic RegionBranchOp path. Any op that implements the
    // interface is lifted by {@link renameRegionBranchOp} — no
    // per-class code in the builder.
    if (isRegionBranchOp(currentOp)) {
      this.renameRegionBranchOp(parentBlock, opIndex, currentOp, stacks, parentPushed);
      return;
    }

    if (isStructure(currentOp)) {
      this.renameStructuredOpMemoryForm(parentBlock, opIndex, currentOp, stacks, parentPushed);
      return;
    }

    // Non-structured HasRegions op: fallback — just push its defs.
    for (const def of currentOp.getDefs()) {
      this.pushStack(stacks, def, parentPushed);
    }
  }

  // ---------------------------------------------------------------------------
  // Generic RegionBranchOp rename
  // ---------------------------------------------------------------------------

  /**
   * Op-agnostic SSA lifting for any op that implements
   * {@link RegionBranchOp}. The algorithm is the textbook iter-args
   * lowering from MLIR's `scf` dialect:
   *
   *   1. Snapshot the rename stacks at the op's entry point.
   *   2. Compute the carried-decl set from writes across
   *      `carriedWriteRegions()`, intersected with
   *      (pre-op visibility ∪ init-region writes).
   *   3. If empty, fall back to memory-form — no lifting needed.
   *   4. Allocate entry-region block params and op-level result
   *      places, one per carried decl each.
   *   5. Hand the plan to `op.withCarriedPorts(plan)` so the op
   *      rebuilds itself with the new ports. Replace in the parent
   *      block.
   *   6. For each region in walk order: restore the snapshot, seed
   *      region-entry bindings, push entry block params if any,
   *      rename linearly, capture final tops, call the op's
   *      `forwardCarriedAtRegion` to update terminators.
   *   7. Restore the snapshot one last time, then push each result
   *      place onto the parent stack as the post-op reaching def
   *      for its carried decl.
   *
   * The builder does not special-case any op kind; every structural
   * decision (which regions to scan, which receive block params,
   * which terminator forwards which edge, how to rebuild the op)
   * lives in the op's interface implementation.
   */
  private renameRegionBranchOp(
    parentBlock: BasicBlock,
    opIndex: number,
    op: Operation & RegionBranchOp,
    stacks: Stacks,
    parentPushed: DeclarationId[],
  ): void {
    const snapshot = this.snapshotTops(stacks);

    // --- 1. Analyze the region-branch CFG ---
    //
    // Classify each region:
    //
    //   - **Prelude**: entered from Parent, reaches another region
    //     via a successor, and is not a back-edge target. Its writes
    //     extend pre-op visibility but don't themselves receive
    //     iter-arg block params. Only ForOp's `initRegion` qualifies.
    //
    //   - **In cycle**: reachable from itself through region→region
    //     edges. Receives carried block params on entry.
    //
    //   - **One-shot**: entered once (from Parent or another region),
    //     exits to parent-exit. No block params. Writes count as
    //     carried (they flow out via the terminator).
    //
    // These classifications are derived from `getSuccessorRegions`
    // alone — no per-op method needed.
    const cfg = this.analyzeRegionCfg(op);

    // --- 2. Compute carried decls ---
    //
    // Carried = writes in non-prelude regions ∩ (snapshot-visible
    // ∪ declared in a prelude region). The prelude-extension is
    // what lets `for (let i = 0; ...)` carry `i` even though the
    // parent scope doesn't declare it.
    const initWrites = new Set<DeclarationId>();
    for (const region of cfg.preludeRegions) {
      this.collectWritesInRegion(region, initWrites);
    }
    const carryableWrites = new Set<DeclarationId>();
    for (const region of op.regions) {
      if (cfg.preludeRegions.has(region)) continue;
      this.collectWritesInRegion(region, carryableWrites);
    }
    const carriedDecls: DeclarationId[] = [];
    for (const decl of carryableWrites) {
      if (snapshot.has(decl) || initWrites.has(decl)) carriedDecls.push(decl);
    }

    if (carriedDecls.length === 0) {
      this.renameStructuredOpMemoryForm(parentBlock, opIndex, op, stacks, parentPushed);
      return;
    }

    // --- 3. Allocate ports ---
    //
    // Entry block params and result places are all allocated via
    // the same `makeCarriedPlace` helper — uniform `blockparam_N`
    // naming for every SSA merge sink, loop or if. Interleaved
    // per-decl to match legacy Value ID order (stable golden
    // outputs).
    const entryParamRegions = [...cfg.cycleRegions];
    const entryParamsByRegion = new Map<Region, Value[]>();
    for (const region of entryParamRegions) entryParamsByRegion.set(region, []);
    const carriedResultPlaces: Value[] = [];
    const newInits: Value[] = [];
    for (const decl of carriedDecls) {
      for (const region of entryParamRegions) {
        entryParamsByRegion.get(region)!.push(this.makeCarriedPlace(decl));
      }
      carriedResultPlaces.push(this.makeCarriedPlace(decl));
      newInits.push(snapshot.get(decl) ?? this.undefSeed);
    }
    for (const region of entryParamRegions) {
      const entry = region.blocks[0];
      entry.params = [...entry.params, ...entryParamsByRegion.get(region)!];
    }

    // --- 4. Install lifted ports via MLIR-style in-place mutation.
    //   Mutable setters (`setInits` / `setResultPlaces`) update the
    //   op in place, preserving op identity and parent-block
    //   attachment. This is MLIR's canonical pattern — no
    //   `replaceOp` round-trip needed.
    const mutableOp = op as Operation &
      RegionBranchOp & {
        setInits?: (v: readonly Value[]) => void;
        setResultPlaces: (v: readonly Value[]) => void;
        resultPlaces: readonly Value[];
      };
    // Full result-place list = existing resultPlaces (e.g. an IfOp's
    // ternary result) + newly-allocated carried places. Read through
    // `resultPlaces` directly rather than `op.results` (= getDefs):
    // ops like ForOfOp/ForInOp report iterationValue + destructure
    // target defs in their defs but those are region-entry bindings,
    // NOT result places — mixing them in inflates the resultPlaces
    // list and misaligns the yield-to-results edge's arg indices.
    const newResultPlaces: Value[] = [...mutableOp.resultPlaces, ...carriedResultPlaces];
    if (newInits.length > 0 && mutableOp.setInits !== undefined) {
      mutableOp.setInits(newInits);
    }
    mutableOp.setResultPlaces(newResultPlaces);

    // Break/Continue terminators look up the enclosing loop to
    // determine which carried-decl tuple they forward. Only ops
    // implementing {@link LoopLikeOpInterface} (WhileOp, ForOp,
    // ForInOp, ForOfOp) plus {@link LabeledBlockOp} (a valid
    // `break label` target even though not a loop) belong on this
    // stack. IfOp / SwitchOp / TryOp do not — they are region-
    // branch ops but not loop targets.
    //
    // MLIR analog: `LoopLikeOpInterface::getLoopRegions()` identifies
    // loops; `break` targets also include `scf.execute_region`-like
    // labeled scopes. This union is what we push.
    const pushLoopContext = isLoopLike(op) || op instanceof LabeledBlockOp;
    const label = (op as { label?: string }).label;
    if (pushLoopContext) {
      this.loopContexts.push({
        op: op as (typeof this.loopContexts)[number]["op"],
        label,
        carriedDecls,
      });
    }
    try {
      // --- 5. Walk regions in program order ---
      //
      // Op-introduced region-entry bindings live on
      // `region.blocks[0].entryBindings` — picked up automatically by
      // `renameBlockLinear`, no builder-side dispatch needed.
      for (const region of op.regions) {
        this.restoreTops(stacks, snapshot);
        const regionPushed: DeclarationId[] = [];
        this.renameRegionLinear(region, stacks, regionPushed);

        // Capture reaching defs for each carried decl at region exit.
        const regionTops: Value[] = carriedDecls.map((decl) => {
          const stack = stacks.get(decl);
          return stack !== undefined && stack.length > 0 ? stack[stack.length - 1] : this.undefSeed;
        });

        // Update forwarding terminators inside this region.
        // Successors of this region (per getSuccessorRegions) tell us
        // which terminators matter; we append/replace their forwarded
        // operands with the carried tops.
        this.forwardCarriedAtRegionTerminators(op, region, regionTops);

        this.popPushed(stacks, regionPushed);
      }
    } finally {
      if (pushLoopContext) this.loopContexts.pop();
    }

    // --- 6. Push result places onto parent stack ---
    this.restoreTops(stacks, snapshot);
    for (let i = 0; i < carriedDecls.length; i++) {
      this.pushValueForDecl(stacks, carriedDecls[i], carriedResultPlaces[i], parentPushed);
    }
  }

  /**
   * Classify each region of a {@link RegionBranchOp} based purely on
   * its position in the region-branch CFG:
   *
   *   - **cycleRegions**: regions reachable from themselves via
   *     region→region edges. These receive carried block params on
   *     entry (iter-arg re-entry).
   *   - **preludeRegions**: regions entered from Parent that have
   *     exactly one incoming edge (no back-edges, not re-entered),
   *     and whose successor flows into another region. Their writes
   *     extend pre-op visibility without themselves being carried.
   */
  private analyzeRegionCfg(op: Operation & RegionBranchOp): {
    preludeRegions: Set<Region>;
    cycleRegions: Set<Region>;
  } {
    // Build the region-to-region edge map.
    const outEdges = new Map<Region, Region[]>();
    const inEdgeCount = new Map<Region, number>();
    const parentTargets = new Set<Region>();
    for (const region of op.regions) {
      outEdges.set(region, []);
      inEdgeCount.set(region, 0);
    }
    for (const succ of op.getSuccessorRegions({ kind: "parent" })) {
      if (succ.target !== parentExit) {
        parentTargets.add(succ.target);
        inEdgeCount.set(succ.target, (inEdgeCount.get(succ.target) ?? 0) + 1);
      }
    }
    for (const region of op.regions) {
      for (const succ of op.getSuccessorRegions({ kind: "region", region })) {
        if (succ.target === parentExit) continue;
        outEdges.get(region)!.push(succ.target);
        inEdgeCount.set(succ.target, (inEdgeCount.get(succ.target) ?? 0) + 1);
      }
    }

    // Cycle membership: DFS from each region, check if we can return
    // to it through region→region edges.
    const cycleRegions = new Set<Region>();
    for (const start of op.regions) {
      const seen = new Set<Region>();
      const inCycle = (from: Region): boolean => {
        for (const next of outEdges.get(from)!) {
          if (next === start) return true;
          if (seen.has(next)) continue;
          seen.add(next);
          if (inCycle(next)) return true;
        }
        return false;
      };
      if (inCycle(start)) cycleRegions.add(start);
    }

    // Prelude: Parent-entered, exactly one incoming edge, has a
    // region-successor (not just parent-exit).
    const preludeRegions = new Set<Region>();
    for (const region of parentTargets) {
      if ((inEdgeCount.get(region) ?? 0) !== 1) continue;
      const outs = outEdges.get(region)!;
      if (outs.length > 0) preludeRegions.add(region);
    }

    return { preludeRegions, cycleRegions };
  }

  /**
   * Append carried tops to every terminator inside `region` that
   * implements {@link RegionBranchTerminator} and whose routing is
   * described by `op.getSuccessorRegions({ region })`. For natural
   * exits (the last block's terminator) we append; this matches
   * MLIR's `scf.yield` / `scf.condition` iter-arg flow.
   *
   * Break/Continue terminators are handled via the loop-context
   * stack in {@link fillLoopExitArgs} — they don't participate in
   * this pass.
   */
  private forwardCarriedAtRegionTerminators(
    op: Operation & RegionBranchOp,
    region: Region,
    carriedTops: readonly Value[],
  ): void {
    const successors = op.getSuccessorRegions({ kind: "region", region });
    if (successors.length === 0) return;
    const lastBlock = region.blocks[region.blocks.length - 1];
    const terminal = lastBlock.terminal;
    if (terminal === undefined) return;
    if (!isRegionBranchTerminator(terminal)) return;
    // Break/Continue terminators are filled by fillLoopExitArgs —
    // they route to an enclosing op, not this one.
    if (terminal instanceof BreakOp || terminal instanceof ContinueOp) return;
    const existing = terminal.getForwardedOperands();
    terminal.setForwardedOperands([...existing, ...carriedTops]);
  }

  /**
   * Linear rename of a region's blocks, with pushes accumulated
   * into `regionPushed` rather than popped per-block. The caller
   * pops after capturing whatever it needs from the post-walk
   * stacks. Used for structured-op region walks (IfOp arms, loop
   * regions) where the caller needs to inspect the region-final
   * reaching defs before the stacks unwind.
   */
  private renameRegionLinear(region: Region, stacks: Stacks, regionPushed: DeclarationId[]): void {
    for (const block of region.blocks) {
      this.renameBlockLinear(block, stacks, regionPushed);
    }
  }

  private renameBlockLinear(
    block: BasicBlock,
    stacks: Stacks,
    regionPushed: DeclarationId[],
  ): void {
    // Op-introduced entry bindings (e.g. ForOfOp's iterationValue /
    // target defs on the body region's entry) are pushed before SSA
    // merge params so body-local reads resolve to them.
    for (const binding of block.entryBindings) {
      this.pushStack(stacks, binding, regionPushed);
    }
    for (const param of block.params) {
      if (param.originalDeclarationId !== undefined) {
        this.pushStack(stacks, param, regionPushed);
      }
    }

    for (let i = 0; i < block.operations.length; i++) {
      const op = block.operations[i];
      if (op.hasTrait(Trait.HasRegions)) {
        this.renameStructuredOp(block, i, op, stacks, regionPushed);
        continue;
      }
      const advance = this.renameFlatOp(op, block, i, stacks, regionPushed);
      if (advance === "rewind") i--;
    }

    if (block.terminal !== undefined) {
      this.renameOpOperands(block.terminal, stacks);
      if (block.terminal instanceof JumpOp) {
        this.fillJumpArgs(block, block.terminal, stacks);
      } else if (block.terminal instanceof BreakOp || block.terminal instanceof ContinueOp) {
        this.fillLoopExitArgs(block, block.terminal, stacks);
      }
    }
  }

  /**
   * Fill `Break`/`Continue` args from the rename stack tops at the
   * terminator's position. Matches against the current loop-context
   * stack by label (innermost unlabeled if absent). A break/continue
   * that doesn't resolve to a lifted loop is left with empty args —
   * memory-form loops don't use iter-args.
   *
   * Uses {@link RegionBranchTerminator.setForwardedOperands} — MLIR
   * in-place mutation, preserves op identity and use-def edges.
   */
  private fillLoopExitArgs(
    _block: BasicBlock,
    terminal: BreakOp | ContinueOp,
    stacks: Stacks,
  ): void {
    const ctx = this.resolveLoopContext(terminal.label);
    if (ctx === undefined || ctx.carriedDecls.length === 0) return;

    const args: Value[] = ctx.carriedDecls.map((decl) => {
      const stack = stacks.get(decl);
      return stack !== undefined && stack.length > 0 ? stack[stack.length - 1] : this.undefSeed;
    });

    terminal.setForwardedOperands(args);
  }

  private resolveLoopContext(
    label: string | undefined,
  ): (typeof this.loopContexts)[number] | undefined {
    for (let i = this.loopContexts.length - 1; i >= 0; i--) {
      const ctx = this.loopContexts[i];
      if (label === undefined || ctx.label === label) return ctx;
    }
    return undefined;
  }

  /**
   * Allocate a fresh block-parameter-style Value for a carried
   * port (block param or result place). The value has a
   * `blockparam_N` name used by codegen; its
   * `originalDeclarationId` records which source-level binding the
   * port merges.
   */
  private makeCarriedPlace(decl: DeclarationId): Value {
    const id = createParamValue(this.moduleIR.environment);
    id.originalDeclarationId = decl;
    return id;
  }

  // ---------------------------------------------------------------------------
  // Other structured ops — memory-form fallback
  // ---------------------------------------------------------------------------

  /**
   * Memory-form fallback for structured ops whose carried values
   * we don't currently lift into SSA ports (TryOp, SwitchOp, BlockOp)
   * — and for loops / labeled-blocks in the degenerate case where no
   * declaration is loop-carried.
   *
   * Snapshot the rename stacks, walk each region with stacks
   * restored to the snapshot, then restore once more after the op.
   * Reads inside the regions resolve to pre-op reaching defs; reads
   * after the op resolve to pre-op defs as well — mutations made in
   * the regions survive as StoreLocal ops and are materialized as
   * `let` assignments by codegen.
   */
  private renameStructuredOpMemoryForm(
    parentBlock: BasicBlock,
    opIndex: number,
    op: Operation,
    stacks: Stacks,
    parentPushed: DeclarationId[],
  ): void {
    const snapshot = this.snapshotTops(stacks);

    for (const region of op.regions) {
      this.restoreTops(stacks, snapshot);
      const armPushed: DeclarationId[] = [];
      this.renameRegionLinear(region, stacks, armPushed);
      this.popPushed(stacks, armPushed);
    }

    this.restoreTops(stacks, snapshot);

    for (const def of op.getDefs()) {
      this.pushStack(stacks, def, parentPushed);
    }
  }

  // ---------------------------------------------------------------------------
  // Jump edge args (flat CFG block-arg SSA)
  // ---------------------------------------------------------------------------

  /**
   * Fill the edge args of a JumpOp from the rename stacks, binding
   * each successor's param to its reaching definition. Missing
   * reaching defs resolve to the function-wide undef seed.
   */
  private fillJumpArgs(block: BasicBlock, terminal: JumpOp, stacks: Stacks): void {
    const succ = terminal.target;
    if (succ.params.length === 0) return;

    // Params on a successor block fall into two kinds:
    //   - SSA-rename params (`originalDeclarationId` set): appended
    //     by `placeParamsForDeclaration`. Their value comes from the
    //     current naming stack for that declaration.
    //   - Frontend-semantic params (no `originalDeclarationId`):
    //     placed by HIR builders (IfTerm/conditional/logical
    //     fallthrough joins, loop headers, etc.) to thread the
    //     expression's value across arms. Their value is already
    //     supplied by the terminal's existing args, positionally
    //     among the no-decl params.
    //
    // Preserve existing args for frontend-semantic params; fill only
    // the SSA-rename params from stacks.
    const existing = terminal.args;
    let frontendArgIdx = 0;
    const args: Value[] = succ.params.map((param) => {
      const decl = param.originalDeclarationId;
      if (decl === undefined) {
        const arg = existing[frontendArgIdx++];
        return arg ?? this.undefSeed;
      }
      const stack = stacks.get(decl);
      if (stack !== undefined && stack.length > 0) {
        return stack[stack.length - 1];
      }
      return this.undefSeed;
    });
    block.replaceOp(terminal, new JumpOp(terminal.id, terminal.target, args));
  }

  // ---------------------------------------------------------------------------
  // Helpers: stacks, writes, snapshots
  // ---------------------------------------------------------------------------

  /**
   * Rename a single flat (non-structured) op in program order,
   * applying mem2reg transformations for promotable bindings.
   *
   * Three outcomes:
   *
   *   1. **Load elision** — op is a `LoadLocalOp` on a promotable
   *      decl with a reaching def on the stack. Record
   *      `load.place → reaching` in {@link rewrites}, delete the op.
   *      Caller must rewind its loop index (`"rewind"`).
   *
   *   2. **Store elision** — op is a `StoreLocalOp` on a promotable
   *      decl. Rewrite operands, push the rhs value onto the decl's
   *      rename stack, delete the op. Caller must rewind
   *      (`"rewind"`).
   *
   *   3. **Normal rename** — rewrite operands through stacks +
   *      {@link rewrites}; push all defs (or the lval, for a
   *      non-promotable StoreLocal) onto their rename stacks.
   *      Caller advances (`"advance"`).
   */
  private renameFlatOp(
    op: Operation,
    block: BasicBlock,
    index: number,
    stacks: Stacks,
    pushed: DeclarationId[],
  ): "advance" | "rewind" {
    if (op instanceof LoadLocalOp && this.tryElideLoad(op, block, index, stacks)) {
      return "rewind";
    }

    this.renameOpOperands(op, stacks);
    const renamed = block.operations[index];

    if (renamed instanceof StoreLocalOp) {
      const decl = renamed.lval.declarationId;
      if (this.promotability.isPromotable(decl)) {
        // Promote: push the rhs value onto the stack and delete the
        // store. Subsequent reads resolve to this value via the stack.
        this.pushValueForDecl(stacks, decl, renamed.value, pushed);
        block.removeOpAt(index);
        return "rewind";
      }
      // Memory-form binding: push the lval so future reads of this
      // decl resolve to the (still-present) StoreLocal's lval place.
      this.pushStack(stacks, renamed.lval, pushed);
      return "advance";
    }

    for (const def of renamed.getDefs()) {
      if (def === renamed.place) continue;
      if (def.declarationId === undefined) continue;
      this.pushStack(stacks, def, pushed);
    }
    return "advance";
  }

  /**
   * Elide a `LoadLocalOp` on a promotable binding by recording an
   * alias from the load's place to the reaching value. Returns
   * `false` (no-op) if the binding is not promotable, if no reaching
   * def exists on the stack, or if the reaching def is the load's
   * own value (a self-load — nothing to elide).
   */
  private tryElideLoad(op: LoadLocalOp, block: BasicBlock, index: number, stacks: Stacks): boolean {
    const decl = op.value.declarationId;
    if (!this.promotability.isPromotable(decl)) return false;
    const stack = stacks.get(decl);
    if (stack === undefined || stack.length === 0) return false;
    const reaching = stack[stack.length - 1];
    if (reaching === op.value) return false;
    this.rewrites.set(op.place, reaching);
    block.removeOpAt(index);
    return true;
  }

  /**
   * Push `value` onto the rename stack for `decl`, recording the
   * push in `pushed` so it can be unwound at region exit.
   */
  private pushValueForDecl(
    stacks: Stacks,
    decl: DeclarationId,
    value: Value,
    pushed: DeclarationId[],
  ): void {
    let stack = stacks.get(decl);
    if (stack === undefined) {
      stack = [];
      stacks.set(decl, stack);
    }
    stack.push(value);
    pushed.push(decl);
  }

  /**
   * Push `place` onto the rename stack of the declaration it
   * represents. Synthetic places (block params, structured-op result
   * places) carry an `originalDeclarationId` that names the source
   * variable they merge; push onto *that* stack so subsequent reads
   * of the source variable find the synthetic place at the top. For
   * non-synthetic places, fall back to `declarationId`.
   */
  private pushStack(stacks: Stacks, place: Value, pushed?: DeclarationId[]): void {
    const decl = place.originalDeclarationId ?? place.declarationId;
    let stack = stacks.get(decl);
    if (stack === undefined) {
      stack = [];
      stacks.set(decl, stack);
    }
    stack.push(place);
    pushed?.push(decl);
  }

  private popPushed(stacks: Stacks, pushed: DeclarationId[]): void {
    for (let i = pushed.length - 1; i >= 0; i--) {
      const stack = stacks.get(pushed[i]);
      if (stack !== undefined && stack.length > 0) stack.pop();
    }
  }

  private collectWritesInRegion(region: Region, writes: Set<DeclarationId>): void {
    for (const block of region.blocks) {
      for (const op of block.operations) {
        if (op instanceof StoreLocalOp) {
          writes.add(op.lval.declarationId);
        }
        if (op.hasTrait(Trait.HasRegions)) {
          for (const innerRegion of op.regions) {
            this.collectWritesInRegion(innerRegion, writes);
          }
        }
      }
    }
  }

  private snapshotTops(stacks: Stacks): Map<DeclarationId, Value> {
    const snap = new Map<DeclarationId, Value>();
    for (const [decl, stack] of stacks) {
      if (stack.length > 0) snap.set(decl, stack[stack.length - 1]);
    }
    return snap;
  }

  private restoreTops(stacks: Stacks, snapshot: Map<DeclarationId, Value>): void {
    for (const [decl, stack] of stacks) {
      const snapTop = snapshot.get(decl);
      while (stack.length > 0 && stack[stack.length - 1] !== snapTop) {
        stack.pop();
      }
    }
  }

  /**
   * Build a value-substitution map for `op.rewrite(...)`. An
   * operand is rewritten if it is either:
   *
   *   - the place of a mem2reg-elided `LoadLocalOp` (looked up in
   *     {@link rewrites}), or
   *   - a non-top place of a decl whose rename stack has a newer
   *     top.
   *
   * The alias map takes precedence: a rewritten load's place has no
   * meaningful declaration-level stack, so the direct alias is the
   * only source of truth.
   */
  private buildRewriteMap(reads: Value[], stacks: Stacks): Map<Value, Value> {
    const map = new Map<Value, Value>();
    for (const place of reads) {
      const alias = this.rewrites.get(place);
      if (alias !== undefined) {
        map.set(place, alias);
        continue;
      }
      const decl = place.declarationId;
      const stack = stacks.get(decl);
      if (stack === undefined || stack.length === 0) continue;
      const top = stack[stack.length - 1];
      if (top !== place) {
        map.set(place, top);
      }
    }
    return map;
  }
}
