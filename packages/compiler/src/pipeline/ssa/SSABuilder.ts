import {
  Operation,
  BasicBlock,
  BlockId,
  DeclarationId,
  Identifier,
  LiteralOp,
  makeOperationId,
  Place,
  StoreLocalOp,
} from "../../ir";
import { FuncOp } from "../../ir/core/FuncOp";
import { ModuleIR } from "../../ir/core/ModuleIR";
import { Trait } from "../../ir/core/Operation";
import { Region } from "../../ir/core/Region";
import {
  collectDestructureTargetBindingPlaces,
  getDestructureTargetDefs,
} from "../../ir/core/Destructure";
import {
  BreakOp,
  ConditionOp,
  ContinueOp,
  ForInOp,
  ForOfOp,
  IfOp,
  isStructure,
  JumpOp,
  TryOp,
  WhileOp,
  YieldOp,
} from "../../ir/ops/control";
import { AnalysisManager } from "../analysis/AnalysisManager";
import { DominatorTreeAnalysis, type DominatorTree } from "../analysis/DominatorTreeAnalysis";
import { createParamIdentifier } from "./utils";

type Stacks = Map<DeclarationId, Place[]>;

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
 *      structured op's region boundary:
 *
 *        - {@link IfOp}: each arm's last {@link YieldOp} carries
 *          arm-final values; the op's {@link IfOp.resultPlaces} bind
 *          those values positionally for the continuation.
 *
 *        - Other structured ops (while/for/for-of/for-in/try/switch/
 *          block/labeled-block): loop- and handler-carried variables
 *          stay in memory form — the rename snapshots stacks on
 *          entry to each region and restores on exit. This is a
 *          deliberate design choice for the JS-targeted codegen
 *          where `let` is already a mutable slot; extending
 *          {@link WhileOp} and the rest with iter-args + result
 *          places is a separate commit that also has to teach
 *          SSAEliminator about back-edges and update the codegen to
 *          emit the init / yield / result stores.
 *
 * Top-level regions use a proper dom-tree rename walk. Structured-
 * op regions use a linear walk (program order) with region-scoped
 * push accumulation — the arms produced by the HIR builder are
 * typically single-block, and the linear walk is equivalent to the
 * dom-tree walk in that case. Multi-block arms appear only when an
 * arm contains `break` / `continue` / `return` that diverts control;
 * those arms don't participate in the value-merge anyway because
 * their last block is not a YieldOp.
 */
export class SSABuilder {
  private readonly funcOp: FuncOp;
  private readonly moduleIR: ModuleIR;
  private readonly AM: AnalysisManager;

  private undefSeed!: Place;
  private domTree!: DominatorTree;
  private readonly blockRegion = new Map<BlockId, Region>();
  private readonly domTreeChildren = new Map<BlockId, BlockId[]>();

  /**
   * Stack of enclosing loop contexts, pushed/popped around body
   * renames. Break/Continue terminators inside a body consult this
   * stack (matching by label, or innermost unlabeled) to find which
   * loop's iter-args they must fill.
   */
  private readonly loopContexts: Array<{
    op: WhileOp;
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
    this.seedHeaderDefinitions(stacks);

    // Place block params at iterated dominance frontiers for the
    // flat CFG of the top-level region. Most JS functions end up
    // with a single body block after the frontend emits structured
    // ops, so this is usually a no-op — but multi-block regions
    // still benefit from Cytron's placement.
    this.placeBlockParams();

    this.indexBlockRegions();
    this.domTree = this.AM.get(DominatorTreeAnalysis, this.funcOp);
    this.computeDomTreeChildren();

    // Textbook rename: dom-tree pre-order walk, starting at the
    // function entry block within the body region.
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
  private materializeUndefSeed(): Place {
    const env = this.moduleIR.environment;
    const place = env.createPlace(env.createIdentifier());
    const opId = makeOperationId(env.nextOperationId++);
    const literal = new LiteralOp(opId, place, undefined);
    const entryBlock = this.funcOp.getBlock(this.funcOp.entryBlockId);
    entryBlock.insertOpAt(0, literal);
    env.placeToOp.set(place.id, literal);
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

    for (const [declId, entries] of this.moduleIR.environment.declToPlaces) {
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

        const id = createParamIdentifier(this.moduleIR.environment);
        id.originalDeclarationId = declId;
        const place = this.moduleIR.environment.createPlace(id);

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

    for (const param of block.params) {
      if (param.identifier.originalDeclarationId !== undefined) {
        this.pushStack(stacks, param, pushed);
      }
    }

    for (let i = 0; i < block.operations.length; i++) {
      const op = block.operations[i];
      if (op.hasTrait(Trait.HasRegions)) {
        this.renameStructuredOp(block, i, op, stacks, pushed);
      } else {
        this.renameOpOperands(op, stacks);
        if (op instanceof StoreLocalOp) {
          this.pushStack(stacks, op.lval, pushed);
        }
      }
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
    if (rewritten.place !== undefined) {
      this.moduleIR.environment.placeToOp.set(rewritten.place.id, rewritten);
    }
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

    if (currentOp instanceof IfOp) {
      this.renameIfOp(parentBlock, opIndex, currentOp, stacks, parentPushed);
      return;
    }

    if (currentOp instanceof WhileOp) {
      this.renameWhileOp(parentBlock, opIndex, currentOp, stacks, parentPushed);
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
    for (const param of block.params) {
      if (param.identifier.originalDeclarationId !== undefined) {
        this.pushStack(stacks, param, regionPushed);
      }
    }

    for (let i = 0; i < block.operations.length; i++) {
      const op = block.operations[i];
      if (op.hasTrait(Trait.HasRegions)) {
        this.renameStructuredOp(block, i, op, stacks, regionPushed);
      } else {
        this.renameOpOperands(op, stacks);
        if (op instanceof StoreLocalOp) {
          this.pushStack(stacks, op.lval, regionPushed);
        }
      }
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
   */
  private fillLoopExitArgs(
    block: BasicBlock,
    terminal: BreakOp | ContinueOp,
    stacks: Stacks,
  ): void {
    const ctx = this.resolveLoopContext(terminal.label);
    if (ctx === undefined || ctx.carriedDecls.length === 0) return;

    const args: Place[] = [];
    for (const decl of ctx.carriedDecls) {
      const stack = stacks.get(decl);
      const top = stack !== undefined && stack.length > 0 ? stack[stack.length - 1] : undefined;
      args.push(top ?? this.undefSeed);
    }

    const TerminalCtor = terminal instanceof BreakOp ? BreakOp : ContinueOp;
    block.replaceOp(terminal, new TerminalCtor(terminal.id, terminal.label, args));
  }

  private resolveLoopContext(label: string | undefined):
    | (typeof this.loopContexts)[number]
    | undefined {
    for (let i = this.loopContexts.length - 1; i >= 0; i--) {
      const ctx = this.loopContexts[i];
      if (label === undefined || ctx.label === label) return ctx;
    }
    return undefined;
  }

  // ---------------------------------------------------------------------------
  // IfOp — arm-merge via resultPlaces + YieldOp
  // ---------------------------------------------------------------------------

  private renameIfOp(
    parentBlock: BasicBlock,
    opIndex: number,
    op: IfOp,
    stacks: Stacks,
    parentPushed: DeclarationId[],
  ): void {
    const snapshot = this.snapshotTops(stacks);
    const perArmTops: Map<DeclarationId, Place>[] = [];
    const perArmWrites: Set<DeclarationId>[] = [];

    for (const region of op.regions) {
      this.restoreTops(stacks, snapshot);
      const writes = new Set<DeclarationId>();
      this.collectWritesInRegion(region, writes);
      const armPushed: DeclarationId[] = [];
      this.renameRegionLinear(region, stacks, armPushed);
      perArmTops.push(this.snapshotTops(stacks));
      perArmWrites.push(writes);
      this.popPushed(stacks, armPushed);
    }

    const mutatedDecls = new Set<DeclarationId>();
    for (const writes of perArmWrites) {
      for (const decl of writes) {
        if (snapshot.has(decl)) mutatedDecls.add(decl);
      }
    }

    this.restoreTops(stacks, snapshot);

    if (mutatedDecls.size === 0) {
      for (const def of op.getDefs()) {
        this.pushStack(stacks, def, parentPushed);
      }
      return;
    }

    const newResultPlaces: Place[] = [...op.resultPlaces];
    const newResultDecls: DeclarationId[] = [];
    for (const decl of mutatedDecls) {
      const id = this.moduleIR.environment.createIdentifier();
      id.originalDeclarationId = decl;
      const place = this.moduleIR.environment.createPlace(id);
      newResultPlaces.push(place);
      newResultDecls.push(decl);
    }

    for (let armIdx = 0; armIdx < op.regions.length; armIdx++) {
      const region = op.regions[armIdx];
      const armTops = perArmTops[armIdx];
      const lastBlock = region.blocks[region.blocks.length - 1];
      const terminal = lastBlock.terminal;
      if (!(terminal instanceof YieldOp)) continue;
      const newValues: Place[] = [...terminal.values];
      for (const decl of newResultDecls) {
        const armTop = armTops.get(decl) ?? snapshot.get(decl) ?? this.undefSeed;
        newValues.push(armTop);
      }
      lastBlock.replaceOp(terminal, new YieldOp(terminal.id, newValues));
    }

    if (!op.hasAlternate) {
      const altRegion = new Region([]);
      const altBlock = this.moduleIR.environment.createBlock();
      altRegion.appendBlock(altBlock);
      this.funcOp.addBlock(altBlock, altRegion);
      const yieldValues: Place[] = [];
      for (const decl of newResultDecls) {
        yieldValues.push(snapshot.get(decl) ?? this.undefSeed);
      }
      altBlock.terminal = new YieldOp(
        makeOperationId(this.moduleIR.environment.nextOperationId++),
        yieldValues,
      );

      const newIfOp = new IfOp(op.id, op.test, newResultPlaces, op.regions[0], altRegion);
      parentBlock.replaceOp(op, newIfOp);
    } else {
      const newIfOp = new IfOp(op.id, op.test, newResultPlaces, op.regions[0], op.regions[1]);
      parentBlock.replaceOp(op, newIfOp);
    }

    for (let i = 0; i < newResultDecls.length; i++) {
      const decl = newResultDecls[i];
      const place = newResultPlaces[op.resultPlaces.length + i];
      let stack = stacks.get(decl);
      if (stack === undefined) {
        stack = [];
        stacks.set(decl, stack);
      }
      stack.push(place);
      parentPushed.push(decl);
    }
  }

  // ---------------------------------------------------------------------------
  // WhileOp — MLIR scf.while iter-args: inits + ConditionOp.args + YieldOp + resultPlaces
  // ---------------------------------------------------------------------------

  /**
   * Lower a {@link WhileOp} into textbook iter-args form.
   *
   * For each declaration that is written somewhere inside the loop
   * AND is visible on the rename stack before the loop starts,
   * allocate a loop-carried port:
   *
   *   - a block parameter on {@link WhileOp.beforeRegion}'s entry,
   *   - a block parameter on {@link WhileOp.bodyRegion}'s entry,
   *   - a result place on the {@link WhileOp}.
   *
   * Populate:
   *
   *   - {@link WhileOp.inits} with each carried decl's pre-loop
   *     reaching def;
   *   - {@link ConditionOp.args} at the end of beforeRegion with the
   *     carried decls' reaching defs at that point;
   *   - {@link YieldOp.values} (appended) at the natural end of
   *     bodyRegion with the body's final reaching defs;
   *   - {@link WhileOp.resultPlaces} bound by the false-path of the
   *     condition to the current iteration's condition args.
   *
   * After the op, push each new result place onto the parent rename
   * stack so post-loop reads see it. Reads inside the regions
   * resolve to the before/body block params naturally, because the
   * region walk pushes block params on entry.
   */
  private renameWhileOp(
    parentBlock: BasicBlock,
    opIndex: number,
    op: WhileOp,
    stacks: Stacks,
    parentPushed: DeclarationId[],
  ): void {
    const snapshot = this.snapshotTops(stacks);

    const writes = new Set<DeclarationId>();
    this.collectWritesInRegion(op.beforeRegion, writes);
    this.collectWritesInRegion(op.bodyRegion, writes);
    const carriedDecls: DeclarationId[] = [];
    for (const decl of writes) {
      if (snapshot.has(decl)) carriedDecls.push(decl);
    }

    // No loop-carried SSA values: walk the regions to rename their
    // ops, then restore the pre-loop snapshot. The loop's mutations
    // stay in memory form (let-var assignments); post-loop reads
    // resolve to the pre-loop def.
    if (carriedDecls.length === 0) {
      this.renameStructuredOpMemoryForm(parentBlock, opIndex, op, stacks, parentPushed);
      return;
    }

    const env = this.moduleIR.environment;

    // Allocate block params on the before and body region entries,
    // plus result places on the WhileOp. One per loop-carried decl.
    const beforeParams: Place[] = [];
    const bodyParams: Place[] = [];
    const newResultPlaces: Place[] = [];
    for (const decl of carriedDecls) {
      beforeParams.push(this.makeCarriedPlace(decl));
      bodyParams.push(this.makeCarriedPlace(decl));
      newResultPlaces.push(this.makeCarriedPlace(decl));
    }

    const beforeEntry = op.beforeRegion.blocks[0];
    beforeEntry.params = [...beforeEntry.params, ...beforeParams];
    const bodyEntry = op.bodyRegion.blocks[0];
    bodyEntry.params = [...bodyEntry.params, ...bodyParams];

    // inits: the reaching def of each carried decl at the WhileOp's
    // position — the pre-loop snapshot top.
    const inits: Place[] = [];
    for (const decl of carriedDecls) {
      inits.push(snapshot.get(decl) ?? this.undefSeed);
    }

    // Push the loop context so Break/Continue in body (and
    // transitively in nested structured ops) can resolve to this
    // loop and snapshot the rename stack for their args. The
    // context stays pushed across both region walks because a
    // `break` in the test expression still targets this loop.
    this.loopContexts.push({ op, label: op.label, carriedDecls });
    try {
      // Rename beforeRegion. Block params are pushed by the linear
      // walk as it processes the entry block. After the walk, each
      // carried decl's stack top is the reaching def at the end of
      // beforeRegion — these become ConditionOp.args.
      this.restoreTops(stacks, snapshot);
      const beforePushed: DeclarationId[] = [];
      this.renameRegionLinear(op.beforeRegion, stacks, beforePushed);
      const condArgs: Place[] = [];
      for (const decl of carriedDecls) {
        const stack = stacks.get(decl);
        const top = stack !== undefined && stack.length > 0 ? stack[stack.length - 1] : undefined;
        condArgs.push(top ?? this.undefSeed);
      }
      this.popPushed(stacks, beforePushed);

      // Rename bodyRegion. After the walk, stack tops for carried
      // decls are the values to feed back via YieldOp (the back-edge
      // values for the next iteration's before-region params).
      this.restoreTops(stacks, snapshot);
      const bodyPushed: DeclarationId[] = [];
      this.renameRegionLinear(op.bodyRegion, stacks, bodyPushed);
      const yieldVals: Place[] = [];
      for (const decl of carriedDecls) {
        const stack = stacks.get(decl);
        const top = stack !== undefined && stack.length > 0 ? stack[stack.length - 1] : undefined;
        yieldVals.push(top ?? this.undefSeed);
      }
      this.popPushed(stacks, bodyPushed);

      this.attachConditionArgs(op.beforeRegion, condArgs);
      this.appendYieldValues(op.bodyRegion, yieldVals);
    } finally {
      this.loopContexts.pop();
    }

    // Replace the WhileOp with one that carries the new ports.
    const newWhileOp = new WhileOp(
      op.id,
      op.beforeRegion,
      op.bodyRegion,
      op.label,
      inits,
      newResultPlaces,
    );
    parentBlock.replaceOp(op, newWhileOp);
    for (const place of newResultPlaces) {
      env.placeToOp.set(place.id, newWhileOp);
    }

    // Restore to pre-loop snapshot, then push each result place as
    // the new reaching def for its carried decl.
    this.restoreTops(stacks, snapshot);
    for (let i = 0; i < carriedDecls.length; i++) {
      const decl = carriedDecls[i];
      let stack = stacks.get(decl);
      if (stack === undefined) {
        stack = [];
        stacks.set(decl, stack);
      }
      stack.push(newResultPlaces[i]);
      parentPushed.push(decl);
    }
  }

  private makeCarriedPlace(decl: DeclarationId): Place {
    const id = createParamIdentifier(this.moduleIR.environment);
    id.originalDeclarationId = decl;
    return this.moduleIR.environment.createPlace(id);
  }

  private attachConditionArgs(beforeRegion: Region, args: Place[]): void {
    for (const block of beforeRegion.blocks) {
      const terminal = block.terminal;
      if (terminal instanceof ConditionOp) {
        block.replaceOp(terminal, new ConditionOp(terminal.id, terminal.value, args));
      }
    }
  }

  private appendYieldValues(bodyRegion: Region, extras: Place[]): void {
    if (extras.length === 0) return;
    const lastBlock = bodyRegion.blocks[bodyRegion.blocks.length - 1];
    const terminal = lastBlock.terminal;
    if (!(terminal instanceof YieldOp)) return;
    lastBlock.replaceOp(terminal, new YieldOp(terminal.id, [...terminal.values, ...extras]));
  }

  // ---------------------------------------------------------------------------
  // Other structured ops — memory-form fallback
  // ---------------------------------------------------------------------------

  /**
   * For structured ops without port-based SSA (WhileOp, ForOp,
   * ForOfOp, ForInOp, TryOp, SwitchOp, BlockOp, LabeledBlockOp),
   * snapshot the rename stacks, walk each region with stacks
   * restored to the snapshot, then restore once more after the op.
   * Reads inside the regions resolve to pre-op reaching defs; reads
   * after the op resolve to pre-op defs as well — mutations made in
   * the regions stay in memory form, to be materialized as let
   * stores by codegen.
   *
   * A follow-up commit can replace this with proper iter-args
   * handling (MLIR `scf.while` style: inits → beforeRegion entry
   * block-params → ConditionOp trailing args → bodyRegion entry
   * block-params → YieldOp values → beforeRegion entry block-params
   * on the back-edge) for loops. That change also has to teach
   * SSAEliminator about the back-edge and update the codegen.
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
      this.seedRegionBindings(op, region, stacks, armPushed);
      this.renameRegionLinear(region, stacks, armPushed);
      this.popPushed(stacks, armPushed);
    }

    this.restoreTops(stacks, snapshot);

    for (const def of op.getDefs()) {
      this.pushStack(stacks, def, parentPushed);
    }
  }

  /**
   * Seed region-introduced bindings so region-local reads see them
   * as reaching defs: for-of / for-in iteration values and try-catch
   * handler params are bound by the enclosing op, not by an op
   * inside the region.
   */
  private seedRegionBindings(
    op: Operation,
    region: Region,
    stacks: Stacks,
    pushed: DeclarationId[],
  ): void {
    if ((op instanceof ForOfOp || op instanceof ForInOp) && op.regions[0] === region) {
      this.pushStack(stacks, op.iterationValue, pushed);
      for (const place of getDestructureTargetDefs(op.iterationTarget)) {
        this.pushStack(stacks, place, pushed);
      }
    }
    if (op instanceof TryOp) {
      const handlerRegion = op.handlerRegion;
      if (handlerRegion !== null && handlerRegion === region && op.handlerParam !== null) {
        this.pushStack(stacks, op.handlerParam, pushed);
      }
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
    const succ = this.funcOp.maybeBlock(terminal.target);
    if (succ === undefined || succ.params.length === 0) return;
    const args: Place[] = succ.params.map((param) => {
      const decl = param.identifier.originalDeclarationId;
      if (decl === undefined) return this.undefSeed;
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
   * Push `place` onto the rename stack of the declaration it
   * represents. Synthetic places (block params, structured-op result
   * places) carry an `originalDeclarationId` that names the source
   * variable they merge; push onto *that* stack so subsequent reads
   * of the source variable find the synthetic place at the top. For
   * non-synthetic places, fall back to `declarationId`.
   */
  private pushStack(stacks: Stacks, place: Place, pushed?: DeclarationId[]): void {
    const decl = place.identifier.originalDeclarationId ?? place.identifier.declarationId;
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
          writes.add(op.lval.identifier.declarationId);
        }
        if (op.hasTrait(Trait.HasRegions)) {
          for (const innerRegion of op.regions) {
            this.collectWritesInRegion(innerRegion, writes);
          }
        }
      }
    }
  }

  private snapshotTops(stacks: Stacks): Map<DeclarationId, Place> {
    const snap = new Map<DeclarationId, Place>();
    for (const [decl, stack] of stacks) {
      if (stack.length > 0) snap.set(decl, stack[stack.length - 1]);
    }
    return snap;
  }

  private restoreTops(stacks: Stacks, snapshot: Map<DeclarationId, Place>): void {
    for (const [decl, stack] of stacks) {
      const snapTop = snapshot.get(decl);
      while (stack.length > 0 && stack[stack.length - 1] !== snapTop) {
        stack.pop();
      }
    }
  }

  private buildRewriteMap(reads: Place[], stacks: Stacks): Map<Identifier, Place> {
    const map = new Map<Identifier, Place>();
    for (const place of reads) {
      const decl = place.identifier.declarationId;
      const stack = stacks.get(decl);
      if (stack === undefined || stack.length === 0) continue;
      const top = stack[stack.length - 1];
      if (top.identifier !== place.identifier) {
        map.set(place.identifier, top);
      }
    }
    return map;
  }
}
