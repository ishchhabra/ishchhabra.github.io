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
import { collectDestructureTargetBindingPlaces } from "../../ir/core/Destructure";
import { JumpTermOp } from "../../ir/ops/control";
import { AnalysisManager } from "../analysis/AnalysisManager";
import { PromotabilityAnalysis } from "./PromotabilityAnalysis";
import { DominatorTreeAnalysis, type DominatorTree } from "../analysis/DominatorTreeAnalysis";
import { createParamValue } from "./utils";

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
 *        - {@link RegionBranchTerminator} on terminators (`YieldTermOp`,
 *          `ConditionTermOp`, `BreakTermOp`, `ContinueTermOp`): exposes the
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
 * their last block is not a YieldTermOp.
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
      const advance = this.renameFlatOp(op, block, i, stacks, pushed);
      if (advance === "rewind") i--;
    }

    if (block.terminal !== undefined) {
      this.renameOpOperands(block.terminal, stacks);
      if (block.terminal instanceof JumpTermOp) {
        this.fillJumpArgs(block, block.terminal, stacks);
      }
    }

    const children = this.domTreeChildren.get(block.id);
    if (children !== undefined) {
      for (const childId of children) {
        this.renameBlockDomTree(this.funcOp.getBlock(childId), stacks);
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

  // Jump edge args (flat CFG block-arg SSA)
  // ---------------------------------------------------------------------------

  /**
   * Fill the edge args of a JumpTermOp from the rename stacks, binding
   * each successor's param to its reaching definition. Missing
   * reaching defs resolve to the function-wide undef seed.
   */
  private fillJumpArgs(block: BasicBlock, terminal: JumpTermOp, stacks: Stacks): void {
    const succ = terminal.target;
    if (succ.params.length === 0) return;

    // Params on a successor block fall into two kinds:
    //   - SSA-rename params (`originalDeclarationId` set): appended
    //     by `placeParamsForDeclaration`. Their value comes from the
    //     current naming stack for that declaration.
    //   - Frontend-semantic params (no `originalDeclarationId`):
    //     placed by HIR builders (IfTermOp/conditional/logical
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
    block.replaceOp(terminal, new JumpTermOp(terminal.id, terminal.target, args));
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

  /**
   * Build a value-substitution map for `op.rewrite(...)`. An operand
   * is rewritten if it is either the place of a mem2reg-elided load
   * (looked up in {@link rewrites}) or a non-top place of a decl
   * whose rename stack has a newer top.
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
