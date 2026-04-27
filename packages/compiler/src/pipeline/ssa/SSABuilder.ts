import {
  Operation,
  BasicBlock,
  BlockId,
  DeclarationId,
  Value,
  BindingDeclOp,
  BindingInitOp,
  LiteralOp,
  LoadLocalOp,
  makeOperationId,
  StoreLocalOp,
} from "../../ir";
import { incomingProducedValues } from "../../ir/cfg";
import { FuncOp } from "../../ir/core/FuncOp";
import { ModuleIR } from "../../ir/core/ModuleIR";
import {
  collectDestructureTargetBindingPlaces,
  type DestructureTarget,
} from "../../ir/core/Destructure";
import { ArrayDestructureOp } from "../../ir/ops/pattern/ArrayDestructure";
import { ObjectDestructureOp } from "../../ir/ops/pattern/ObjectDestructure";
import { ExportSpecifierOp } from "../../ir/ops/module/ExportSpecifier";
import { ExportDefaultDeclarationOp } from "../../ir/ops/module/ExportDefaultDeclaration";
import {
  successorArgValue,
  valueSuccessorArg,
  type SuccessorArg,
  type TermOp,
} from "../../ir/core/TermOp";
import { AnalysisManager } from "../analysis/AnalysisManager";
import { DominatorTreeAnalysis, type DominatorTree } from "../analysis/DominatorTreeAnalysis";
import type { PassResult } from "../PassManager";

type Stacks = Map<DeclarationId, Value[]>;

/** Reasons a declaration cannot be promoted to SSA. Kept for diagnostics. */
enum NonPromotableReason {
  Context = "context",
  Captured = "captured",
  Exported = "exported",
  ComplexWriter = "complex-writer",
}

/**
 * Classify source-level bindings as promotable-to-SSA or not — the
 * LLVM `isAllocaPromotable` equivalent. A declaration is non-promotable
 * when any of the following holds:
 *
 *   1. It is a module-level context binding (closures / exports observe
 *      the cell; ECMA-262 §9.1 Environment Records).
 *   2. It is captured by a nested function — rewriting to specific
 *      Values would embed stale values in the closure's capture list.
 *   3. It is referenced by an `ExportSpecifierOp` or
 *      `ExportDefaultDeclarationOp` (ECMA-262 §16.2.1.7).
 *   4. Some writer is a multi-def op other than a plain
 *      destructure op or `StoreLocalOp`
 *      (for-of / for-in iter targets, try-catch handler params, …).
 *
 * RHS purity is NOT considered — ordering of side-effectful
 * expressions is a materialization concern (`ValueMaterializationPass`).
 */
function analyzePromotability(
  funcOp: FuncOp,
  moduleIR: ModuleIR,
): ReadonlyMap<DeclarationId, NonPromotableReason> {
  const nonPromotable = new Map<DeclarationId, NonPromotableReason>();
  const mark = (decl: DeclarationId, reason: NonPromotableReason): void => {
    if (!nonPromotable.has(decl)) nonPromotable.set(decl, reason);
  };

  for (const decl of moduleIR.environment.contextDeclarationIds) {
    mark(decl, NonPromotableReason.Context);
  }

  for (const block of funcOp.blocks) {
    for (const op of block.getAllOps()) {
      const captures = (op as { captures?: readonly Value[] }).captures;
      if (captures !== undefined) {
        for (const c of captures) mark(c.declarationId, NonPromotableReason.Captured);
      }
      if (op instanceof ExportSpecifierOp) {
        mark(op.local.declarationId, NonPromotableReason.Exported);
      } else if (op instanceof ExportDefaultDeclarationOp) {
        const d = op.declaration.declarationId;
        if (d !== undefined) mark(d, NonPromotableReason.Exported);
      }
    }
  }

  for (const block of funcOp.blocks) {
    for (const op of block.operations) {
      if (op instanceof StoreLocalOp || op instanceof BindingInitOp) continue;

      if (op instanceof ArrayDestructureOp || op instanceof ObjectDestructureOp) continue;

      for (const def of op.results()) {
        if (def === op.place || def.declarationId === undefined) continue;
        mark(def.declarationId, NonPromotableReason.ComplexWriter);
      }
    }
  }

  return nonPromotable;
}

/**
 * Mem2reg + SSA construction.
 *
 * The frontend emits IR in memory form: every source-level variable
 * materializes as `StoreLocalOp` / `LoadLocalOp` (or `StoreContextOp`
 * / `LoadContextOp` for captured bindings). This pass promotes
 * memory-form bindings to SSA form using Cytron's iterated-dominance-
 * frontier algorithm, fused with mem2reg.
 *
 * ## What this pass does
 *
 * 1. **Place block parameters** at iterated dominance frontiers
 *    ({@link placeBlockParams}). Standard Cytron IDF worklist, run
 *    per declaration that has multiple writers.
 *
 * 2. **Dom-tree pre-order rename** ({@link renameBlock}), with a
 *    per-declaration stack of reaching definitions. At block entry
 *    we push (block params, entry bindings); at block exit we pop.
 *    Reads rewrite their operand to the stack top; defs push onto
 *    the stack.
 *
 * 3. **Mem2reg, fused into rename.** For declarations
 *    {@link analyzePromotability} classifies as promotable:
 *    - A `StoreLocalOp` pushes its *rhs value* onto the rename
 *      stack and is deleted in place.
 *    - A `LoadLocalOp` records `load.place → reaching value` in
 *      {@link rewrites} and is deleted. Later uses of the load's
 *      place are rewritten through this alias map.
 *
 * 4. **Fresh SSA names for non-promotable defs.** Declarations
 *    classified as non-promotable (captured, exported, complex
 *    writer, destructure-assignment target) keep their memory ops,
 *    but every def still gets a **fresh Value** allocated at rename
 *    time. This matches React Compiler's `EnterSSA` pattern: every
 *    store / destructure target mints a new SSA identifier, so the
 *    single-assignment-per-Value invariant holds uniformly. Loads
 *    read the stack top via normal rename, which is the current
 *    store's fresh lval. Without this step, multiple writes to the
 *    same binding would redefine the same Value, collapsing lattice
 *    analyses like constant propagation to an imprecise `meet` —
 *    and forcing a post-hoc reaching-def walker to recover the
 *    precision strict SSA already guarantees.
 *
 * 5. **Fill jump-edge args** at each `JumpTermOp`
 *    ({@link fillJumpArgs}): for each successor block param, look
 *    up the current stack top and bind it as the edge's positional
 *    argument.
 *
 * ## Merge representation
 *
 * Merges use **block parameters** rather than phi nodes. A
 * `JumpTermOp` carries args that bind positionally to the target
 * block's `params`. Other CFG terminators (`IfTermOp`, `WhileTermOp`,
 * etc.) route control without forwarding values; arm blocks jump to
 * merge points via `JumpTermOp`, and that's where values are threaded.
 *
 * ## Two block-param flavors
 *
 * Block params fall into two kinds, distinguished by whether
 * `originalDeclarationId` is set:
 *
 *   - **SSA-rename params** (`originalDeclarationId !== undefined`)
 *     are placed by this pass at Cytron IDF points for a specific
 *     source declaration. `fillJumpArgs` fills them from the rename
 *     stack.
 *
 *   - **Frontend-semantic params** (no `originalDeclarationId`) are
 *     placed by HIR builders *before* this pass runs — they carry
 *     the result value of an expression-valued construct (`a ?? b`,
 *     `c ? d : e`, logical-assignment joins). Their args are already
 *     filled by the emitting builder; `fillJumpArgs` preserves them
 *     positionally.
 *
 * ## Invariant
 *
 * Values stored in {@link rewrites} and on rename stacks are always
 * *terminal* — never themselves aliased. This holds because the
 * stack holds terminals and we never push a load's place onto a
 * stack. So no transitive chasing is required at lookup.
 *
 * ## References
 *
 *   - Cytron et al. 1991, "Efficiently Computing Static Single
 *     Assignment Form and the Control Dependence Graph".
 *   - LLVM `PromoteMemoryToRegister.cpp` — the mem2reg pattern for
 *     promotable bindings.
 *   - React Compiler `EnterSSA.ts` — the fresh-name-per-store
 *     pattern for non-promotable bindings.
 */
export class SSABuilder {
  private readonly funcOp: FuncOp;
  private readonly moduleIR: ModuleIR;
  private readonly AM: AnalysisManager;

  private domTree!: DominatorTree;
  private readonly domTreeChildren = new Map<BlockId, BlockId[]>();

  /**
   * Mem2reg alias map: for every elided {@link LoadLocalOp}, records
   * `load.place → reaching value`. Consulted by
   * {@link buildRewriteMap}. Values in this map are always terminal
   * (see class-doc invariant), so no transitive resolution is needed.
   */
  private readonly rewrites = new Map<Value, Value>();

  /**
   * Declarations that cannot be promoted to SSA, with the reason.
   * Populated by {@link analyzePromotability} at the start of
   * {@link build}. A declaration is promotable iff it is *not* in this
   * map.
   */
  private nonPromotable!: ReadonlyMap<DeclarationId, NonPromotableReason>;

  /**
   * Function-wide undef sentinel — a single `LiteralOp(undefined)`
   * at the top of the entry block. Used as the arg on jump edges
   * where a successor block param has no reaching definition.
   */
  private undefSeed!: Value;

  constructor(funcOp: FuncOp, moduleIR: ModuleIR, AM: AnalysisManager) {
    this.funcOp = funcOp;
    this.moduleIR = moduleIR;
    this.AM = AM;
  }

  public run(): PassResult {
    const stacks: Stacks = new Map();
    this.undefSeed = this.materializeUndefSeed();
    this.nonPromotable = analyzePromotability(this.funcOp, this.moduleIR);

    this.seedHeaderDefinitions(stacks);
    this.placeBlockParams();

    this.domTree = this.AM.get(DominatorTreeAnalysis, this.funcOp);
    this.computeDomTreeChildren();

    this.renameBlock(this.funcOp.entryBlock, stacks);
    return { changed: true };
  }

  public build(): void {
    this.run();
  }

  private isPromotable(decl: DeclarationId): boolean {
    return !this.nonPromotable.has(decl);
  }

  private materializeUndefSeed(): Value {
    const env = this.moduleIR.environment;
    const place = env.createValue();
    const literal = new LiteralOp(makeOperationId(env.nextOperationId++), place, undefined);
    this.funcOp.entryBlock.insertOpAt(0, literal);
    return place;
  }

  // ===========================================================================
  // Setup
  // ===========================================================================

  /**
   * Seed permanent rename-stack entries for function parameter definitions:
   * formal parameters and destructured parameter bindings.
   * These live at the bottom of their stacks for the whole function.
   */
  private seedHeaderDefinitions(stacks: Stacks): void {
    for (const param of this.funcOp.params) {
      this.seedStack(stacks, param.value);
    }
    for (const param of this.funcOp.params) {
      if (param.kind !== "arg") continue;
      for (const place of collectDestructureTargetBindingPlaces(param.source.target)) {
        this.seedStack(stacks, place);
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

  // ===========================================================================
  // Block-param placement — Cytron iterated dominance frontier
  // ===========================================================================

  private placeBlockParams(): void {
    const blockIds = new Set<BlockId>();
    for (const block of this.funcOp.blocks) blockIds.add(block.id);
    if (blockIds.size <= 1) return;

    const domTree = this.AM.get(DominatorTreeAnalysis, this.funcOp);
    const env = this.moduleIR.environment;

    for (const [declId, entries] of env.declToValues) {
      if (env.contextDeclarationIds.has(declId)) continue;

      const defBlocks = entries.filter((e) => blockIds.has(e.blockId)).map((e) => e.blockId);
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

        const place = this.moduleIR.environment.createValue();
        place.originalDeclarationId = declId;

        const frontierBlock = this.requireBlock(frontier);
        frontierBlock.params = [...frontierBlock.params, place];
        hasParam.add(frontier);

        if (!defSet.has(frontier)) {
          defSet.add(frontier);
          worklist.push(frontier);
        }
      }
    }
  }

  // ===========================================================================
  // Rename — dom-tree pre-order walk with scoped push / pop
  // ===========================================================================

  /**
   * Textbook Cytron rename. At block entry, push entry-bindings and
   * SSA-rename params onto per-declaration stacks. Rename every op in
   * program order (mem2reg elisions are deferred into `toDelete` and
   * swept after the loop). Fill jump-edge args from stacks. Recurse
   * into dom-tree children. Pop everything pushed in this block.
   */
  private renameBlock(block: BasicBlock, stacks: Stacks): void {
    const pushed: DeclarationId[] = [];

    for (const value of incomingProducedValues(this.funcOp, block)) {
      this.pushScoped(stacks, value, pushed);
    }
    for (const param of block.params) {
      if (param.originalDeclarationId !== undefined) this.pushScoped(stacks, param, pushed);
    }

    // Deferred-deletion pattern: rename walks forward; ops to elide
    // are marked and removed in a reverse-index sweep after the loop.
    // Avoids the hazard of mutating a list while iterating it.
    const toDelete = new Set<Operation>();
    for (const op of block.operations) {
      this.renameOp(op, stacks, pushed, toDelete);
    }
    if (toDelete.size > 0) {
      for (let i = block.operations.length - 1; i >= 0; i--) {
        if (toDelete.has(block.operations[i])) block.removeOpAt(i);
      }
    }

    if (block.terminal !== undefined) {
      this.renameOpOperands(block.terminal, stacks);
      this.fillTerminalArgs(block, block.terminal, stacks);
    }

    for (const childId of this.domTreeChildren.get(block.id) ?? []) {
      this.renameBlock(this.requireBlock(childId), stacks);
    }

    this.popScoped(stacks, pushed);
  }

  /**
   * Rename one op. Three outcomes:
   *
   *   1. **Load promotion** — `LoadLocalOp` on a promotable binding
   *      with a reaching def: record `load.place → reaching` in
   *      {@link rewrites}, mark op for deletion.
   *   2. **Store promotion** — `StoreLocalOp` on a promotable binding:
   *      rewrite operands, push the rhs onto the decl's stack, mark
   *      op for deletion.
   *   3. **Normal rename** — rewrite operands through stacks +
   *      {@link rewrites}; push all defs (or the lval, for a
   *      non-promotable StoreLocal) onto their rename stacks.
   */
  private renameOp(
    op: Operation,
    stacks: Stacks,
    pushed: DeclarationId[],
    toDelete: Set<Operation>,
  ): void {
    if (op instanceof LoadLocalOp && this.tryPromoteLoad(op, stacks)) {
      toDelete.add(op);
      return;
    }

    // Rewriting operands may produce a fresh op that replaces `op` in
    // its block. All downstream checks must look at the rewritten op.
    const current = this.renameOpOperands(op, stacks);

    if (current instanceof StoreLocalOp) {
      const decl = current.lval.declarationId;
      if (this.isPromotable(decl)) {
        // mem2reg: push the rhs, delete the store. Loads rewrite to
        // the rhs via `tryPromoteLoad`.
        this.pushScopedForDecl(stacks, decl, current.value, pushed);
        toDelete.add(current);
        return;
      }
      this.renameNonPromotableStore(current, stacks, pushed);
      return;
    }

    if (current instanceof BindingDeclOp) {
      const decl = current.place.declarationId;
      this.pushScopedForDecl(stacks, decl, current.place, pushed);
      return;
    }

    if (current instanceof BindingInitOp) {
      const decl = current.place.declarationId;
      if (this.isPromotable(decl)) {
        this.pushScopedForDecl(stacks, decl, current.value, pushed);
        toDelete.add(current);
        return;
      }
      this.pushScopedForDecl(stacks, decl, current.place, pushed);
      return;
    }

    if (current instanceof ArrayDestructureOp || current instanceof ObjectDestructureOp) {
      this.renameDestructure(current, stacks, pushed);
      return;
    }

    this.renameNonPromotableDefs(current, stacks, pushed);
  }

  private renameDestructure(
    op: ArrayDestructureOp | ObjectDestructureOp,
    stacks: Stacks,
    pushed: DeclarationId[],
  ): void {
    if (op.kind !== "assignment" || !this.isPromotableDestructureAssignment(op)) {
      this.renameNonPromotableDefs(op, stacks, pushed);
      return;
    }

    const env = this.moduleIR.environment;
    const freshMap = new Map<Value, Value>();
    const stackPushes: Array<{ decl: DeclarationId; value: Value }> = [];
    for (const target of this.collectPromotableBindingTargets(op)) {
      const decl = target.place.declarationId;
      const fresh = env.createValue();
      freshMap.set(target.place, fresh);
      stackPushes.push({ decl, value: fresh });
    }

    const rewritten = op.rewrite(freshMap, { rewriteDefinitions: true });
    const replacement =
      rewritten instanceof ArrayDestructureOp
        ? new ArrayDestructureOp(
            rewritten.id,
            rewritten.place,
            rewritten.elements,
            rewritten.value,
            "declaration",
            "const",
          )
        : new ObjectDestructureOp(
            rewritten.id,
            rewritten.place,
            rewritten.properties,
            rewritten.value,
            "declaration",
            "const",
          );
    op.parentBlock?.replaceOp(op, replacement);

    for (const { decl, value } of stackPushes) {
      this.pushScopedForDecl(stacks, decl, value, pushed);
    }
  }

  private isPromotableDestructureAssignment(op: ArrayDestructureOp | ObjectDestructureOp): boolean {
    const targets = this.collectPromotableBindingTargets(op);
    for (const target of targets) {
      if (!this.isPromotable(target.place.declarationId)) return false;
    }
    return targets.length > 0;
  }

  private collectPromotableBindingTargets(
    op: ArrayDestructureOp | ObjectDestructureOp,
  ): Array<{ place: Value }> {
    const root: DestructureTarget =
      op instanceof ArrayDestructureOp
        ? { kind: "array", elements: op.elements }
        : { kind: "object", properties: op.properties };
    const targets: Array<{ place: Value }> = [];
    if (!collectLocalBindingTargets(root, targets)) return [];
    return targets;
  }

  /**
   * Non-promotable `StoreLocalOp`: allocate a fresh SSA Value for the
   * store's `lval` and rewrite the op in place. Applies to both
   * declaration- and assignment-kind stores — in strict SSA every
   * write defines a new name. Push the fresh lval onto the decl's
   * rename stack so later reads rewrite to it.
   */
  private renameNonPromotableStore(
    op: StoreLocalOp,
    stacks: Stacks,
    pushed: DeclarationId[],
  ): void {
    const env = this.moduleIR.environment;
    const freshLval = env.createValue(op.lval.declarationId);
    freshLval.originalDeclarationId = op.lval.originalDeclarationId ?? op.lval.declarationId;
    const renamed = new StoreLocalOp(op.id, op.place, freshLval, op.value, op.bindings, op.binding);
    op.parentBlock?.replaceOp(op, renamed);
    this.pushScoped(stacks, freshLval, pushed);
  }

  /**
   * For each def on a non-`StoreLocalOp` op that names a
   * non-promotable declaration, allocate a fresh SSA Value and rewrite
   * the op in place so it defines that fresh Value. Push the fresh
   * Value onto the decl's rename stack. Covers `ArrayDestructureOp` /
   * `ObjectDestructureOp` binding targets, and any other multi-def op.
   */
  private renameNonPromotableDefs(op: Operation, stacks: Stacks, pushed: DeclarationId[]): void {
    const env = this.moduleIR.environment;
    const freshMap = new Map<Value, Value>();
    for (const def of op.results()) {
      if (def === op.place) continue;
      if (def.declarationId === undefined) continue;
      const fresh = env.createValue(def.declarationId);
      fresh.originalDeclarationId = def.originalDeclarationId ?? def.declarationId;
      freshMap.set(def, fresh);
    }
    if (freshMap.size === 0) return;

    const rewritten = op.rewrite(freshMap, { rewriteDefinitions: true });
    const current = rewritten === op ? op : (op.parentBlock?.replaceOp(op, rewritten), rewritten);

    for (const def of current.results()) {
      if (def === current.place) continue;
      if (def.declarationId === undefined) continue;
      this.pushScoped(stacks, def, pushed);
    }
  }

  /**
   * Record an alias for an elidable load. Returns false if the load
   * isn't elidable (non-promotable decl, no reaching def, or self-read).
   */
  private tryPromoteLoad(op: LoadLocalOp, stacks: Stacks): boolean {
    const decl = op.value.declarationId;
    if (!this.isPromotable(decl)) return false;
    const stack = stacks.get(decl);
    if (stack === undefined || stack.length === 0) return false;
    const reaching = stack[stack.length - 1];
    if (reaching === op.value) return false;
    this.rewrites.set(op.place, reaching);
    return true;
  }

  /**
   * Rewrite `op`'s operands through the current rename stacks. If
   * `op.rewrite` produces a fresh op, swap it in. Returns the op
   * currently in the block at `op`'s position — `op` itself when no
   * rewrite happened, or the replacement op when one did.
   */
  private renameOpOperands(op: Operation, stacks: Stacks): Operation {
    const rewriteMap = this.buildRewriteMap(op.operands(), stacks);
    if (rewriteMap.size === 0) return op;
    const rewritten = op.rewrite(rewriteMap);
    if (rewritten === op) return op;
    op.parentBlock?.replaceOp(op, rewritten);
    return rewritten;
  }

  // ===========================================================================
  // Successor-edge args — fill each exposed CFG edge from the rename stacks
  // ===========================================================================

  /**
   * Fill executable successor edge args from the current rename stacks,
   * binding each successor-block param positionally to its reaching
   * definition. See the class-doc "Two block-param flavors" section for
   * how SSA-rename vs frontend-semantic params are split.
   */
  private fillTerminalArgs(block: BasicBlock, terminal: TermOp, stacks: Stacks): void {
    let rewritten: TermOp = terminal;
    let changed = false;

    for (const index of terminal.successorIndices()) {
      const currentTarget = rewritten.target(index);
      if (currentTarget.block.params.length === 0) continue;
      const nextArgs = this.fillTargetArgs(currentTarget.block.params, currentTarget.args, stacks);
      if (successorArgsEqual(currentTarget.args, nextArgs)) continue;
      rewritten = rewritten.withTarget(index, { ...currentTarget, args: nextArgs });
      changed = true;
    }

    if (changed) block.replaceOp(terminal, rewritten);
  }

  private fillTargetArgs(
    params: readonly Value[],
    existing: readonly SuccessorArg[],
    stacks: Stacks,
  ): SuccessorArg[] {
    let frontendArgIdx = 0;
    return params.map((param) => {
      const decl = param.originalDeclarationId;
      if (decl === undefined) {
        return existing[frontendArgIdx++] ?? valueSuccessorArg(this.undefSeed);
      }
      const stack = stacks.get(decl);
      if (stack !== undefined && stack.length > 0)
        return valueSuccessorArg(stack[stack.length - 1]);
      return valueSuccessorArg(this.undefSeed);
    });
  }

  // ===========================================================================
  // Rename stack — scoped vs seeded pushes
  //
  // Two kinds of pushes with opposite lifetimes:
  //
  //   - seedStack       — function-lifetime, never popped.
  //   - pushScoped      — block-scoped, popped at block exit.
  //   - pushScopedForDecl — same as pushScoped, but for a bare value
  //                          on an explicit decl (mem2reg store path).
  //
  // The decl on which we push follows `originalDeclarationId` when
  // set (block params / synthetic places carry it, naming the source
  // variable they merge) and falls back to `declarationId` otherwise.
  // ===========================================================================

  private seedStack(stacks: Stacks, place: Value): void {
    const decl = place.originalDeclarationId ?? place.declarationId;
    const stack = stacks.get(decl) ?? (stacks.set(decl, []).get(decl) as Value[]);
    stack.push(place);
  }

  private pushScoped(stacks: Stacks, place: Value, pushed: DeclarationId[]): void {
    const decl = place.originalDeclarationId ?? place.declarationId;
    const stack = stacks.get(decl) ?? (stacks.set(decl, []).get(decl) as Value[]);
    stack.push(place);
    pushed.push(decl);
  }

  private pushScopedForDecl(
    stacks: Stacks,
    decl: DeclarationId,
    value: Value,
    pushed: DeclarationId[],
  ): void {
    const stack = stacks.get(decl) ?? (stacks.set(decl, []).get(decl) as Value[]);
    stack.push(value);
    pushed.push(decl);
  }

  private popScoped(stacks: Stacks, pushed: DeclarationId[]): void {
    for (let i = pushed.length - 1; i >= 0; i--) {
      stacks.get(pushed[i])?.pop();
    }
  }

  // ===========================================================================
  // Read rewrites — operand substitution via stacks + mem2reg alias map
  // ===========================================================================

  /**
   * Build a value-substitution map for `op.rewrite(...)`. An operand
   * is rewritten if it's either (a) the place of a mem2reg-elided
   * load (looked up in {@link rewrites}) or (b) a non-top place of a
   * decl whose rename stack has a newer top.
   */
  private buildRewriteMap(reads: readonly Value[], stacks: Stacks): Map<Value, Value> {
    const map = new Map<Value, Value>();
    for (const place of reads) {
      const alias = this.rewrites.get(place);
      if (alias !== undefined) {
        map.set(place, alias);
        continue;
      }
      const stack = stacks.get(place.declarationId);
      if (stack === undefined || stack.length === 0) continue;
      const top = stack[stack.length - 1];
      if (top !== place) map.set(place, top);
    }
    return map;
  }

  private requireBlock(blockId: BlockId): BasicBlock {
    const block = this.funcOp.blocks.find((candidate) => candidate.id === blockId);
    if (block === undefined) {
      throw new Error(`Block ${blockId} not found in function ${this.funcOp.id}`);
    }
    return block;
  }
}

function successorArgsEqual(a: readonly SuccessorArg[], b: readonly SuccessorArg[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].kind !== b[i].kind || successorArgValue(a[i]) !== successorArgValue(b[i])) {
      return false;
    }
  }
  return true;
}

function collectLocalBindingTargets(
  target: DestructureTarget,
  out: Array<{ place: Value }>,
): boolean {
  switch (target.kind) {
    case "binding":
      if (target.storage !== "local") return false;
      out.push({ place: target.place });
      return true;
    case "static-member":
    case "dynamic-member":
      return false;
    case "assignment":
      return collectLocalBindingTargets(target.left, out);
    case "rest":
      return collectLocalBindingTargets(target.argument, out);
    case "array":
      for (const element of target.elements) {
        if (element !== null && !collectLocalBindingTargets(element, out)) return false;
      }
      return true;
    case "object":
      for (const property of target.properties) {
        if (!collectLocalBindingTargets(property.value, out)) return false;
      }
      return true;
  }
}
