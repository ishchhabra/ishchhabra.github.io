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

/**
 * Textbook MLIR-style SSA construction with structured control flow.
 *
 * For each region, walks its blocks in dominator-tree order (within a
 * region — which for most JS functions is a single block, so no
 * dominator analysis is needed) and renames reads to reaching defs.
 *
 * For structured ops, the algorithm recurses into each region with a
 * snapshot of the rename stacks. After all regions have been
 * processed, variables that were mutated in any region are lifted
 * into result places on the structured op: each region's last
 * YieldOp is updated to carry the arm-local final value, and reads
 * after the structured op in the parent block are rewritten to use
 * the new result place.
 *
 * For multi-block regions (flat intra-region CFG), Cytron's classical
 * algorithm still applies: block params are placed at iterated
 * dominance frontiers and terminator edge args are filled from the
 * reaching rename stack.
 */
export class SSABuilder {
  constructor(
    private readonly funcOp: FuncOp,
    private readonly moduleIR: ModuleIR,
    private readonly AM: AnalysisManager,
  ) {}

  public build(): void {
    const stacks = new Map<DeclarationId, Place[]>();
    const undefSeed = this.materializeUndefSeed();

    this.seedHeaderDefinitions(stacks);

    // Place block params at iterated dominance frontiers for the
    // flat CFG of the top-level region. Most JS functions end up
    // with a single body block after the frontend emits structured
    // ops, so this is usually a no-op — but multi-block regions
    // still benefit from Cytron's placement.
    this.placeBlockParams();

    const topLevelPushed: DeclarationId[] = [];
    this.renameRegion(this.funcOp.body, stacks, undefSeed, topLevelPushed);
  }

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
  private seedHeaderDefinitions(stacks: Map<DeclarationId, Place[]>): void {
    for (const place of this.funcOp.params) {
      this.pushStack(stacks, place);
    }
    // Walk the source-level param patterns to seed every binding
    // place (both local and context storage). This derives the same
    // set the retired `funcOp.paramBindings` used to cache, directly
    // from `paramPatterns` — the source of truth.
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

  private pushStack(
    stacks: Map<DeclarationId, Place[]>,
    place: Place,
    pushed?: DeclarationId[],
  ): void {
    const decl = place.identifier.declarationId;
    let stack = stacks.get(decl);
    if (stack === undefined) {
      stack = [];
      stacks.set(decl, stack);
    }
    stack.push(place);
    pushed?.push(decl);
  }

  // ---------------------------------------------------------------------------
  // Block-param placement (Cytron IDF, for multi-block top-level regions)
  // ---------------------------------------------------------------------------

  /**
   * Place block params at iterated dominance frontiers for every
   * declaration with defs in more than one block of the top-level
   * CFG. Returns the set of declarations that had params placed.
   */
  private placeBlockParams(): void {
    // Only top-level (body region) blocks participate in classical
    // block-param SSA. Nested region blocks get their merges via
    // structured-op result places.
    const topLevelBlockIds = new Set<BlockId>();
    for (const block of this.funcOp.body.blocks) {
      topLevelBlockIds.add(block.id);
    }
    if (topLevelBlockIds.size <= 1) {
      return;
    }

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
  // Rename phase
  // ---------------------------------------------------------------------------

  /**
   * Walk a region's blocks in program order, rewriting reads and
   * pushing defs onto rename stacks. All pushes across all blocks
   * in the region are accumulated in `regionPushed` so the stacks
   * retain the region's final state until the caller pops them.
   */
  private renameRegion(
    region: Region,
    stacks: Map<DeclarationId, Place[]>,
    undefSeed: Place,
    regionPushed: DeclarationId[],
  ): void {
    for (const block of region.blocks) {
      this.renameBlock(block, stacks, undefSeed, regionPushed);
    }
  }

  private renameBlock(
    block: BasicBlock,
    stacks: Map<DeclarationId, Place[]>,
    undefSeed: Place,
    regionPushed: DeclarationId[],
  ): void {
    // Push block params onto rename stacks.
    for (const param of block.params) {
      const decl = param.identifier.originalDeclarationId;
      if (decl === undefined) continue;
      this.pushStack(stacks, param, regionPushed);
    }

    // Walk ops in program order. Only `StoreLocalOp` contributes to
    // the let-variable rename stack — other ops produce temporary
    // SSA values and do not define new versions of let variables.
    for (let i = 0; i < block.operations.length; i++) {
      const op = block.operations[i];
      if (op.hasTrait(Trait.HasRegions)) {
        this.renameStructuredOp(block, i, op, stacks, undefSeed, regionPushed);
      } else {
        this.renameOpOperands(op, stacks);
        if (op instanceof StoreLocalOp) {
          this.pushStack(stacks, op.lval, regionPushed);
        }
      }
    }

    // Terminator.
    if (block.terminal !== undefined) {
      this.renameOpOperands(block.terminal, stacks);
      if (block.terminal instanceof JumpOp) {
        this.fillJumpArgs(block, block.terminal, stacks, undefSeed);
      }
    }
  }

  /**
   * Rewrite the operands of `op` through the current rename stacks.
   * Structured ops defer their operand rewriting to this point, same
   * as regular instructions — the operand rewrite is position-
   * independent and only touches reads, not defs.
   */
  private renameOpOperands(op: Operation, stacks: Map<DeclarationId, Place[]>): void {
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

  /**
   * Structured-op rename. For each region:
   *   1. Snapshot the rename stacks
   *   2. Recurse into the region
   *   3. Compute which declarations were mutated (top != snapshot)
   *   4. Collect each arm's final value for each mutated decl
   * After all regions, lift the mutations into `resultPlaces` on the
   * structured op and update each region's last YieldOp to carry the
   * new values. Push the new result places onto the parent rename
   * stack so subsequent reads in the parent block see them.
   */
  private renameStructuredOp(
    parentBlock: BasicBlock,
    opIndex: number,
    op: Operation,
    stacks: Map<DeclarationId, Place[]>,
    undefSeed: Place,
    parentPushed: DeclarationId[],
  ): void {
    // Rewrite the op's operands first (using the current stacks).
    this.renameOpOperands(op, stacks);
    // `op` may have been replaced by renameOpOperands; re-read it.
    const currentOp = parentBlock.operations[opIndex];

    if (!(currentOp instanceof IfOp || currentOp instanceof WhileOp || isStructure(currentOp))) {
      // Fallback: just push its defs (if any) and move on.
      for (const def of currentOp.getDefs()) {
        this.pushStack(stacks, def, parentPushed);
      }
      return;
    }

    // For WhileOp, the body region reads values from BEFORE the loop
    // *and* from the previous iteration. For our JS backend we keep
    // let vars in memory form and do not re-SSA across the loop
    // back-edge.
    const snapshot = this.snapshotTops(stacks);
    const perArmTops: Map<DeclarationId, Place>[] = [];
    const perArmWrites: Set<DeclarationId>[] = [];

    for (const region of currentOp.regions) {
      this.restoreTops(stacks, snapshot);
      const writes = new Set<DeclarationId>();
      this.collectWritesInRegion(region, writes);
      const armPushed: DeclarationId[] = [];
      // Seed region-introduced bindings onto the stack before
      // entering the region: for-of / for-in iteration values and
      // try / catch handler params are "bound" by the enclosing op
      // and must be visible as reaching defs inside their region.
      this.seedRegionBindings(currentOp, region, stacks, armPushed);
      this.renameRegion(region, stacks, undefSeed, armPushed);
      perArmTops.push(this.snapshotTops(stacks));
      perArmWrites.push(writes);
      // Pop this arm's pushes so the next arm starts from the
      // pre-if snapshot.
      for (let i = armPushed.length - 1; i >= 0; i--) {
        stacks.get(armPushed[i])!.pop();
      }
    }

    // Collect declarations written in any arm that are VISIBLE
    // before the structured op (i.e., already on the rename stack).
    // Block-local declarations inside the arms don't escape —
    // they're popped when the arm exits. Only pre-existing
    // declarations can be merged through result places.
    const mutatedDecls = new Set<DeclarationId>();
    for (const writes of perArmWrites) {
      for (const decl of writes) {
        if (snapshot.has(decl)) {
          mutatedDecls.add(decl);
        }
      }
    }

    this.restoreTops(stacks, snapshot);

    // Only IfOp (and other value-yielding ops) supports lifting
    // mutations into resultPlaces. For loops and tries, mutations
    // stay in memory form — we just restore the stacks and move on.
    if (currentOp instanceof IfOp && mutatedDecls.size > 0) {
      const newResultPlaces: Place[] = [...currentOp.resultPlaces];
      const newResultDecls: DeclarationId[] = [];
      for (const decl of mutatedDecls) {
        const id = this.moduleIR.environment.createIdentifier();
        id.originalDeclarationId = decl;
        const place = this.moduleIR.environment.createPlace(id);
        newResultPlaces.push(place);
        newResultDecls.push(decl);
      }

      // Update each region's last YieldOp to carry the arm values
      // for the new result places. If an arm didn't assign the
      // variable, yield the pre-if version (or undef seed).
      for (let armIdx = 0; armIdx < currentOp.regions.length; armIdx++) {
        const region = currentOp.regions[armIdx];
        const armTops = perArmTops[armIdx];
        const lastBlock = region.blocks[region.blocks.length - 1];
        const terminal = lastBlock.terminal;
        if (!(terminal instanceof YieldOp)) continue;
        const newValues: Place[] = [...terminal.values];
        for (const decl of newResultDecls) {
          const armTop = armTops.get(decl) ?? snapshot.get(decl) ?? undefSeed;
          newValues.push(armTop);
        }
        lastBlock.replaceOp(terminal, new YieldOp(terminal.id, newValues));
      }

      // If the IfOp has no alternate, synthesize one that yields
      // the pre-if versions of each result so both paths produce
      // the merged values.
      if (!currentOp.hasAlternate) {
        const altRegion = new Region([]);
        const altBlock = this.moduleIR.environment.createBlock();
        altRegion.appendBlock(altBlock);
        this.funcOp.addBlock(altBlock, altRegion);
        const yieldValues: Place[] = [];
        for (const decl of newResultDecls) {
          const val = snapshot.get(decl) ?? undefSeed;
          yieldValues.push(val);
        }
        altBlock.terminal = new YieldOp(
          makeOperationId(this.moduleIR.environment.nextOperationId++),
          yieldValues,
        );

        const newIfOp = new IfOp(
          currentOp.id,
          currentOp.test,
          newResultPlaces,
          currentOp.regions[0],
          altRegion,
        );
        parentBlock.replaceOp(currentOp, newIfOp);
      } else {
        const newIfOp = new IfOp(
          currentOp.id,
          currentOp.test,
          newResultPlaces,
          currentOp.regions[0],
          currentOp.regions[1],
        );
        parentBlock.replaceOp(currentOp, newIfOp);
      }

      // Push the new result places onto the parent rename stack.
      for (let i = 0; i < newResultDecls.length; i++) {
        const decl = newResultDecls[i];
        const place = newResultPlaces[currentOp.resultPlaces.length + i];
        let stack = stacks.get(decl);
        if (stack === undefined) {
          stack = [];
          stacks.set(decl, stack);
        }
        stack.push(place);
        parentPushed.push(decl);
      }
    }

    // Push the op's own defs onto the parent stack.
    const opAfter = parentBlock.operations[opIndex];
    for (const def of opAfter.getDefs()) {
      this.pushStack(stacks, def, parentPushed);
    }
  }

  /**
   * Seed the rename stacks with any bindings that the structured
   * op introduces into its region. For for-of / for-in, the
   * iteration target's binding places act as per-iteration
   * bindings; for try-catch, the handler region gets the catch
   * parameter binding.
   */
  private seedRegionBindings(
    op: Operation,
    region: Region,
    stacks: Map<DeclarationId, Place[]>,
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

  /**
   * Walk a region's blocks (recursing into nested structured ops'
   * regions) and collect the set of declarations that have a
   * `StoreLocalOp` writing to them.
   */
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

  private snapshotTops(
    stacks: Map<DeclarationId, Place[]>,
  ): Map<DeclarationId, Place> {
    const snap = new Map<DeclarationId, Place>();
    for (const [decl, stack] of stacks) {
      if (stack.length > 0) snap.set(decl, stack[stack.length - 1]);
    }
    return snap;
  }

  private restoreTops(
    stacks: Map<DeclarationId, Place[]>,
    snapshot: Map<DeclarationId, Place>,
  ): void {
    // Trim each stack down to the snapshot top, or pop completely
    // if the snapshot had no value for this decl.
    for (const [decl, stack] of stacks) {
      const snapTop = snapshot.get(decl);
      while (stack.length > 0 && stack[stack.length - 1] !== snapTop) {
        stack.pop();
      }
    }
  }

  private buildRewriteMap(
    reads: Place[],
    stacks: Map<DeclarationId, Place[]>,
  ): Map<Identifier, Place> {
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

  /**
   * Fill the edge args of a JumpOp from the rename stacks, binding
   * each successor's param to its reaching definition. Missing
   * reaching defs resolve to the function-wide undef seed.
   */
  private fillJumpArgs(
    block: BasicBlock,
    terminal: JumpOp,
    stacks: Map<DeclarationId, Place[]>,
    undefSeed: Place,
  ): void {
    const succ = this.funcOp.maybeBlock(terminal.target);
    if (succ === undefined || succ.params.length === 0) return;
    const args: Place[] = succ.params.map((param) => {
      const decl = param.identifier.originalDeclarationId;
      if (decl === undefined) return undefSeed;
      const stack = stacks.get(decl);
      if (stack !== undefined && stack.length > 0) {
        return stack[stack.length - 1];
      }
      return undefSeed;
    });
    block.replaceOp(terminal, new JumpOp(terminal.id, terminal.target, args));
  }
}
