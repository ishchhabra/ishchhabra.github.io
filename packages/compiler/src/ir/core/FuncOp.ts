import { FunctionDeclarationOp } from "../ops/func/FunctionDeclaration";
import { ArrowFunctionExpressionOp } from "../ops/func/ArrowFunctionExpression";
import { FunctionExpressionOp } from "../ops/func/FunctionExpression";
import { BasicBlock, BlockId } from "./Block";
import type { Environment } from "../../environment";
import {
  collectDestructureTargetBindingPlaces,
  type DestructureTarget,
  rewriteDestructureTarget,
} from "./Destructure";
import { Value } from "./Value";
import type { LexicalScopeKind } from "./LexicalScope";
import { ModuleIR } from "./ModuleIR";
import {
  type CloneContext,
  makeCloneContext,
  makeOperationId,
  Operation,
  type OperationId,
  Trait,
} from "./Operation";
import { Region } from "./Region";
import { IfOp, type Terminal } from "../ops/control";

// ---------------------------------------------------------------------
// Block clone helpers (used by FuncOp.clone only)
// ---------------------------------------------------------------------

/**
 * Phase-1 block clone: allocate a fresh block, deep-clone every
 * non-region op into it. Region-owning ops are skipped — they're
 * cloned in phase 2, once every block has been allocated and the
 * clone context's `blockMap` is fully populated.
 */
function phase1CloneBlock(oldBlock: BasicBlock, moduleIR: ModuleIR): BasicBlock {
  const environment = moduleIR.environment;
  const newBlock = environment.createBlock();
  const ctx: CloneContext = {
    environment,
    moduleIR,
    blockMap: new Map(),
    valueMap: new Map(),
  };
  for (const op of oldBlock.operations) {
    if (op.hasTrait(Trait.HasRegions)) continue;
    const cloned = op.clone(ctx);
    newBlock.appendOp(cloned);
  }
  newBlock.params = [...oldBlock.params];
  return newBlock;
}

/**
 * Phase-2 block rewrite: walk every op already in `block` and
 * substitute operands through `valueMap`. Terminators are re-cloned
 * (their clone wires successor block refs through `blockMap`);
 * non-terminators are rewritten in place when `rewrite()` returns a
 * fresh op. Block params are remapped too if present.
 */
function phase2RewriteBlock(
  block: BasicBlock,
  environment: Environment,
  blockMap: Map<BasicBlock, BasicBlock>,
  valueMap: Map<Value, Value>,
  options: { rewriteDefinitions?: boolean } = {},
): void {
  const ctx: CloneContext = { environment, moduleIR: undefined, blockMap, valueMap };
  for (const op of [...block.operations]) {
    const rewritten = op.rewrite(valueMap, options);
    if (rewritten !== op) block.replaceOp(op, rewritten);
  }
  if (block.terminal !== undefined) {
    const rewrittenTerminal = block.terminal.clone(ctx) as Terminal;
    block.replaceOp(block.terminal, rewrittenTerminal);
  }
  if (block.params.length > 0) {
    const newParams: Value[] = [];
    let changed = false;
    for (const param of block.params) {
      const mapped = valueMap.get(param) ?? param;
      if (mapped !== param) changed = true;
      newParams.push(mapped);
    }
    if (changed) block.params = newParams;
  }
}

/**
 * Stable id for a {@link FuncOp}. Since `FuncOp` is now a
 * proper {@link Operation} (a `FuncOp`-style structured op with a
 * body region), its id IS an {@link OperationId}. The historical
 * `FuncOpId` name is preserved as a type alias so the rest of the
 * codebase keeps reading naturally.
 */
export type FuncOpId = OperationId;

export function makeFuncOpId(id: number): FuncOpId {
  return makeOperationId(id);
}

type NestedFunctionInstruction =
  | ArrowFunctionExpressionOp
  | FunctionExpressionOp
  | FunctionDeclarationOp;

/**
 * MLIR `func.func`-style top-level operation: a function with a
 * body region. Inherits the {@link Operation} contract — `id` is an
 * {@link OperationId}, `regions[0]` is the function body — and adds
 * function-specific metadata (source / runtime info, async / generator
 * flags, the per-function id index for fast block lookup, the SSA phi
 * side set, etc.).
 *
 */
export class FuncOp extends Operation {
  /**
   * MLIR-style top-level body region — alias for `regions[0]`.
   * Every {@link BasicBlock} in this function is reachable from
   * `body.allBlocks()` (or from a nested structured op's region).
   * The `blocks` Map below is a synchronized O(1) id index; the
   * region tree is the source of truth for ownership.
   */
  public get body(): Region {
    return this.regions[0];
  }

  get entryBlockId(): BlockId {
    return this.body.entry.id;
  }

  get entryBlock(): BasicBlock {
    return this.body.entry;
  }

  /**
   * Function formal parameters, MLIR-style: the entry block's block
   * parameters. Each `params[i]` is the SSA root Value of the
   * corresponding formal parameter — the same Value that instructions
   * in the body read from. At call sites, the caller's argument i is
   * bound to `params[i]` on entry; conceptually the call is an
   * outgoing edge into the entry block carrying those args.
   *
   * Destructuring and default-value initialization live in
   * `prologue` — synthetic setup ops that run once on entry before
   * the body executes. The destructure targets for codegen's JS
   * signature emission live in `paramPatterns`.
   */
  get params(): readonly Value[] {
    return this.entryBlock.params;
  }

  // -----------------------------------------------------------------------
  // Block API
  //
  // The region tree rooted at `body` is the single source of truth for
  // block ownership: every block lives in exactly one region, and its
  // `parent` back-pointer identifies the containing region. All block
  // iteration and lookup below goes through `body.allBlocks()`, which
  // recursively walks the region tree (including nested regions owned
  // by structured ops).
  //
  // MLIR idiom: there is no parallel flat Map. Lookups are O(n); if a
  // workload needs O(1) it can build its own Map once and reuse it.
  // -----------------------------------------------------------------------

  /**
   * Walk every block in this function, recursing through the region
   * tree. Order is region-depth-first (body blocks in program order,
   * recursing into each structured op's regions as they're encountered).
   */
  *allBlocks(): IterableIterator<BasicBlock> {
    yield* this.body.allBlocks();
  }

  /** Iterator yielding every block's id in region-walk order. */
  *blockIds(): IterableIterator<BlockId> {
    for (const block of this.allBlocks()) yield block.id;
  }

  /** Look up a block by id. Throws if not present. O(n) region walk. */
  getBlock(blockId: BlockId): BasicBlock {
    const block = this.maybeBlock(blockId);
    if (!block) {
      throw new Error(`Block ${blockId} not found in function ${this.id}`);
    }
    return block;
  }

  /** Look up a block by id or return `undefined`. O(n) region walk. */
  maybeBlock(blockId: BlockId): BasicBlock | undefined {
    for (const block of this.allBlocks()) {
      if (block.id === blockId) return block;
    }
    return undefined;
  }

  constructor(
    /**
     * The {@link ModuleIR} this function belongs to. Set at construction
     * and never changed.
     */
    public readonly moduleIR: ModuleIR,
    id: FuncOpId,
    /**
     * Synthetic ops that run once on function entry, before any body
     * op executes: parameter destructuring, default-value evaluation,
     * argument-list gathering, etc. Conceptually these are "the
     * prologue" of the function.
     *
     * Today they live in their own array rather than at the top of
     * the entry block, so passes that walk the function body only
     * (via `allBlocks()`) do not see them. Passes that need to see
     * them walk `funcOp.prologue` alongside the blocks. A full
     * MLIR-shape move would put them at the top of the entry block
     * with an op-level "synthetic" marker; see
     * MLIR_MIGRATION_STATUS.md for the follow-up.
     *
     * **Invariant**: `header ⊆ prologue`, in order. Every op in
     * `header` also appears in `prologue` at the same relative
     * position. `prologue \ header` is the runtime-only setup that
     * codegen must NOT re-emit (param-array gathering, lowered
     * destructuring) because it's already encoded in
     * `paramPatterns`.
     */
    public readonly prologue: readonly Operation[],
    /**
     * Subset of {@link prologue} that codegen walks during signature
     * emission to populate `generator.places` with AST nodes for
     * default-value expressions and computed destructure keys. These
     * are the prologue ops that the source-fidelity signature needs
     * to reference (e.g., to emit `function f(x = <default>)` we need
     * the default's AST in the places map).
     *
     * A strict subset of `prologue` — the ops that `buildFunctionParams`
     * explicitly routed through `addHeaderOp`. The remaining
     * `prologue` ops (runtime param-array gathering, lowered
     * destructuring) are invisible to codegen because `paramPatterns`
     * already encodes their effect in source-fidelity form.
     */
    public readonly header: readonly Operation[],
    /**
     * Source-level shape of each JS formal parameter, one entry per
     * `function f(...)` parameter. Codegen reads this to emit the
     * original signature syntax (destructuring patterns, default
     * values, rest elements) without having to reconstruct it from
     * the lowered prologue ops. Opaque to optimization passes — they
     * work off the entry block params + prologue ops as usual.
     *
     * Currently typed as `DestructureTarget[]`, which is wider than
     * JS parameter grammar (the spec's `BindingPattern` excludes
     * `static-member` / `dynamic-member`, which are legal in
     * expression-position destructuring but not in params). The
     * frontend only ever constructs binding-kind targets here, so the
     * invariant holds by construction. A future `ParamPattern` type
     * can tighten this when a pass starts synthesizing param patterns
     * from scratch; see MLIR_MIGRATION_STATUS.md.
     */
    public readonly paramPatterns: readonly DestructureTarget[],
    /**
     * Closure capture bindings: one Value per captured outer-scope
     * variable. The inner function's blocks resolve captured reads
     * through these indirection places so the body stays decoupled
     * from the parent scope's identifiers.
     */
    public readonly captureParams: readonly Value[],
    /** Whether the function is `async`. */
    public readonly async: boolean,
    /** Whether the function is a generator (`function*`, etc.). */
    public readonly generator: boolean,
    /**
     * The function's body region. The caller is responsible for
     * populating it with the function's top-level blocks (any blocks
     * that aren't already claimed by a nested structured op's region).
     * The scope kind is set here from `bodyScopeKind` regardless of
     * what the region was constructed with.
     */
    bodyRegion: Region,
    /**
     * Maps header (test/back-edge) block IDs to label names for
     * while/for/do-while loops. These loops are reconstructed from
     * back-edges during codegen and have no dedicated structure or
     * terminal to carry the label.
     */
    public readonly blockLabels: Map<BlockId, string> = new Map(),
    /**
     * Id of the FuncOp that lexically encloses this one, or `null` for
     * top-level (module) functions. Used by the function inliner's
     * visibility check to walk the function nesting tree without
     * consulting `LexicalScope`. Set by the frontend at build time.
     */
    public readonly parentFuncOpId: FuncOpId | null = null,
    /**
     * Scope kind for the function's body region. `"program"` for the
     * module top-level function, `"function"` for every other function.
     * Set by the frontend at build time; the body region records it so
     * scope queries derive it from the region tree without consulting
     * the legacy per-block `scopeId`.
     */
    bodyScopeKind: LexicalScopeKind = "function",
  ) {
    bodyRegion.scopeKind = bodyScopeKind === "program" ? "program" : "function";
    super(id, [bodyRegion]);
    moduleIR.functions.set(id, this);
  }

  // -----------------------------------------------------------------------
  // Operation contract — FuncOp implements the abstract Operation methods
  // with function-specific behavior.
  // -----------------------------------------------------------------------

  /** A function-as-op has no SSA operands at the op level. */
  override getOperands(): Value[] {
    return [];
  }

  /**
   * Add a block to a region owned by this function. Defaults to the
   * top-level body region. The region tree owns the block after this
   * call — there is no parallel id index to keep in sync.
   */
  addBlock(block: BasicBlock, region: Region = this.body): void {
    region.appendBlock(block);
  }

  public *getRuntimeOpLists(): IterableIterator<readonly Operation[]> {
    yield this.prologue;
    for (const block of this.allBlocks()) {
      yield block.operations;
    }
  }

  public *getDefinitionOpLists(): IterableIterator<readonly Operation[]> {
    yield this.prologue;
    for (const block of this.allBlocks()) {
      yield block.operations;
    }
  }

  public *getRuntimeOps(): IterableIterator<Operation> {
    for (const instructions of this.getRuntimeOpLists()) {
      for (const instruction of instructions) {
        yield instruction;
      }
    }
  }

  public *getNestedFunctionOps(): IterableIterator<NestedFunctionInstruction> {
    for (const instr of this.prologue) {
      if (
        instr instanceof ArrowFunctionExpressionOp ||
        instr instanceof FunctionExpressionOp ||
        instr instanceof FunctionDeclarationOp
      ) {
        yield instr;
      }
    }
    for (const block of this.allBlocks()) {
      for (const instr of block.operations) {
        if (
          instr instanceof ArrowFunctionExpressionOp ||
          instr instanceof FunctionExpressionOp ||
          instr instanceof FunctionDeclarationOp
        ) {
          yield instr;
        }
      }
    }
  }

  /**
   * Rewrite every op in every block through the given value mapping.
   * Each op's `rewrite(values)` returns either itself (no change) or
   * a fresh op with substituted operands; the fresh op replaces the
   * original in the block.
   */
  rewriteAllBlocks(values: Map<Value, Value>): void {
    for (const block of this.allBlocks()) {
      for (const op of [...block.getAllOps()]) {
        const rewritten = op.rewrite(values);
        if (rewritten !== op) block.replaceOp(op, rewritten);
      }
    }
  }

  public hasExternalReferences(): boolean {
    const ownPlaceIds = new Set<number>();

    for (const param of this.params) {
      ownPlaceIds.add(param.id);
    }
    for (const pattern of this.paramPatterns) {
      for (const binding of collectDestructureTargetBindingPlaces(pattern)) {
        ownPlaceIds.add(binding.id);
      }
    }
    for (const captureParam of this.captureParams) {
      ownPlaceIds.add(captureParam.id);
    }
    for (const instr of this.prologue) {
      ownPlaceIds.add(instr.place!.id);
    }
    for (const block of this.allBlocks()) {
      for (const instr of block.operations) {
        ownPlaceIds.add(instr.place!.id);
      }
    }

    for (const instr of this.prologue) {
      for (const place of instr.getOperands()) {
        if (!ownPlaceIds.has(place.id)) {
          return true;
        }
      }
    }
    for (const block of this.allBlocks()) {
      for (const instr of block.operations) {
        for (const place of instr.getOperands()) {
          if (!ownPlaceIds.has(place.id)) {
            return true;
          }
        }
      }
      if (block.terminal) {
        for (const place of block.terminal.getOperands()) {
          if (!ownPlaceIds.has(place.id)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  public findOwningIf(blockId: BlockId): { headerBlockId: BlockId; structure: IfOp } | null {
    for (const block of this.allBlocks()) {
      for (const op of block.getAllOps()) {
        if (!(op instanceof IfOp)) continue;
        if (op.consequentRegion.entry.id === blockId || op.alternateRegion?.entry.id === blockId) {
          return { headerBlockId: block.id, structure: op };
        }
      }
    }
    return null;
  }

  /**
   * Function-level deep clone. Implements {@link Operation.clone} —
   * the only piece of the {@link CloneContext} this method consults
   * is `ctx.moduleIR`, which is treated as the target module for the
   * clone. The block / identifier maps in `ctx` are ignored because
   * function-level cloning builds its own from scratch.
   *
   * Callers that previously called `funcOp.clone(targetModule)`
   * should pass `makeCloneContext(targetModule)` to get the same
   * behavior.
   */
  override clone(ctx: CloneContext): FuncOp {
    if (ctx.moduleIR === undefined) {
      throw new Error(
        "FuncOp.clone: moduleIR is required. Build the context via makeCloneContext(moduleIR).",
      );
    }
    const targetModule = ctx.moduleIR;
    const environment = targetModule.environment;
    const blockMap = new Map<BasicBlock, BasicBlock>();
    const valueMap = new Map<Value, Value>();
    // Function-level clone builds its own cross-block context — the
    // caller-provided `ctx`'s maps are not relevant here.
    const childCtx = makeCloneContext(targetModule);
    (childCtx as { blockMap: Map<BasicBlock, BasicBlock> }).blockMap = blockMap;
    (childCtx as { valueMap: Map<Value, Value> }).valueMap = valueMap;
    // Clone the full prologue. Track the old→new mapping so we can
    // rebuild `header` (a strict subset of `prologue`) against the
    // same cloned instances — preserving the invariant that every
    // element of `header` is also an element of `prologue` by
    // reference.
    const prologueCloneMap = new Map<Operation, Operation>();
    const cloneInstructionList = (instructions: readonly Operation[]): Operation[] => {
      const clonedInstructions: Operation[] = [];
      for (const instr of instructions) {
        const cloned = instr.clone(childCtx);
        valueMap.set(instr.place!, cloned.place!);
        this.registerAdditionalDefinitionPlaces(instr, valueMap, environment);
        clonedInstructions.push(cloned);
        prologueCloneMap.set(instr, cloned);
      }
      return clonedInstructions;
    };

    const newPrologue = cloneInstructionList(this.prologue);
    const newHeader = this.header.map((op) => {
      const cloned = prologueCloneMap.get(op);
      if (cloned === undefined) {
        throw new Error("FuncOp.clone: header op not found in prologue clone map");
      }
      return cloned;
    });

    // Phase 1: clone every block in the region tree (flat). Each
    // cloned block carries its non-region ops (Block.clone defers
    // region-owning ops until phase 2 so their remapRegion calls see
    // a fully-populated blockMap).
    const oldBlocks = [...this.body.allBlocks()];
    const oldToNewBlock = new Map<BasicBlock, BasicBlock>();
    for (const oldBlock of oldBlocks) {
      const newBlock = phase1CloneBlock(oldBlock, targetModule);
      blockMap.set(oldBlock, newBlock);
      oldToNewBlock.set(oldBlock, newBlock);
      for (let i = 0; i < oldBlock.operations.length; i++) {
        valueMap.set(oldBlock.operations[i]!.place!, newBlock.operations[i]!.place!);
        this.registerAdditionalDefinitionPlaces(oldBlock.operations[i]!, valueMap, environment);
      }
    }

    // Ensure region-owning-op and block-param identifiers are in
    // the valueMap BEFORE rewriting instructions. Region-owning
    // ops (IfOp result places, Switch/Try catch-param places, etc.)
    // and block params may reference identifiers created by
    // optimization passes that aren't instruction outputs — they'd
    // be missed by the instruction-based valueMap population
    // above. Without remapping, the clone would share PlaceIds with
    // the original, causing collisions in CodeGenerator's shared
    // places map.
    for (const oldBlock of oldBlocks) {
      for (const op of oldBlock.getAllOps()) {
        if (!op.hasTrait(Trait.HasRegions)) continue;
        for (const place of [...op.getOperands(), ...op.getDefs()]) {
          if (!valueMap.has(place)) {
            valueMap.set(place, environment.createValue());
          }
        }
      }
    }
    for (const oldBlock of oldBlocks) {
      for (const param of oldBlock.params) {
        if (valueMap.has(param)) continue;
        const newIdentifier = environment.createValue();
        // Carry the original variable's declarationId onto the clone's
        // param identifier so `SSAEliminator` / `LivenessAnalysis` /
        // `rebuildPhisFromBlockArgs` can locate the backing
        // declaration in the cloned function exactly the way they
        // do in the source.
        newIdentifier.originalDeclarationId = param.originalDeclarationId;
        valueMap.set(param, newIdentifier);
      }
    }

    // Now rewrite all instructions with the complete valueMap.
    // Preserve the header subset invariant: the rewritten prologue
    // op replaces the entry in both arrays, so if a header-subset
    // element is rewritten to a fresh instance we update the header
    // slot too.
    for (let i = 0; i < newPrologue.length; i++) {
      const before = newPrologue[i];
      const after = before.rewrite(valueMap, { rewriteDefinitions: true });
      if (after !== before) {
        newPrologue[i] = after;
        for (let h = 0; h < newHeader.length; h++) {
          if (newHeader[h] === before) newHeader[h] = after;
        }
      }
    }
    for (const newBlock of oldToNewBlock.values()) {
      phase2RewriteBlock(newBlock, environment, blockMap, valueMap, { rewriteDefinitions: true });
    }

    // Phase 2: clone region-owning ops. Block.clone skipped them in
    // phase 1 because their clone() calls remapRegion, which needs
    // every block to already exist in blockMap. Now that every block
    // has been created, clone each region-owning op with the fully-
    // populated childCtx and insert it at the correct position in
    // the new block. Structured ops are not terminators — they're
    // inline ops, so we insert them at their original non-region
    // index. Their clone() walks their regions via remapRegion,
    // which picks up the cloned nested blocks and wraps them in new
    // Region instances — setting block.parent on each nested block,
    // which is exactly what we want.
    for (const [oldBlock, newBlock] of oldToNewBlock) {
      let nonRegionIndex = 0;
      for (const oldOp of oldBlock.getAllOps()) {
        if (oldOp.hasTrait(Trait.Terminator)) continue;
        if (!oldOp.hasTrait(Trait.HasRegions)) {
          nonRegionIndex++;
          continue;
        }
        const cloned = oldOp.clone(childCtx);
        newBlock.insertOpAt(nonRegionIndex, cloned);
        nonRegionIndex++;
      }
    }

    // Build the new body region from ONLY the top-level blocks.
    // Nested region blocks were claimed by structured ops' regions
    // during phase 2 via remapRegion, so they already have the right
    // parent back-pointer and should NOT be reparented into body.
    const newBodyBlocks: BasicBlock[] = [];
    for (const oldBlock of this.body.blocks) {
      const newBlock = oldToNewBlock.get(oldBlock);
      if (newBlock === undefined) continue;
      newBodyBlocks.push(newBlock);
    }
    const newBodyRegion = new Region(newBodyBlocks);

    const remapPlace = (place: Value): Value => valueMap.get(place) ?? place;
    const remapTarget = (target: DestructureTarget): DestructureTarget =>
      rewriteDestructureTarget(target, valueMap, { rewriteDefinitions: true });
    const newParamPatterns = this.paramPatterns.map(remapTarget);
    // Entry block params are cloned as part of `block.clone` +
    // `block.rewrite` above — no separate remapping step needed.
    const newCaptureParams = this.captureParams.map(remapPlace);
    const newBlockLabels = new Map<BlockId, string>();
    for (const oldBlock of oldBlocks) {
      const label = this.blockLabels.get(oldBlock.id);
      if (label === undefined) continue;
      const newBlock = blockMap.get(oldBlock);
      if (newBlock !== undefined) newBlockLabels.set(newBlock.id, label);
    }

    const newId = makeFuncOpId(environment.nextFunctionId++);
    const populated = new FuncOp(
      targetModule,
      newId,
      newPrologue,
      newHeader,
      newParamPatterns,
      newCaptureParams,
      this.async,
      this.generator,
      newBodyRegion,
      newBlockLabels,
      this.parentFuncOpId,
      this.body.scopeKind ?? "function",
    );
    return populated;
  }

  /**
   * Rewrite all instructions, terminals, structures, and block-arg
   * operands across the entire function using the given identifier →
   * place mapping. Implements {@link Operation.rewrite} — function-
   * level rewriting is a deep, in-place sweep of every block and
   * side store; the return value is `this` to satisfy the Operation
   * contract (which permits returning a fresh op for immutable
   * rewrites).
   *
   * Block params are definitions, not reads, so they are left
   * alone; rewriteAllBlocks — the in-place sibling — does not
   * rename defs. Terminator edge args, however, are reads and are
   * rewritten as part of the terminal's own `rewrite` call above.
   */
  override rewrite(
    values: Map<Value, Value>,
    options: { skipBlock?: BasicBlock; skipInstructionIndex?: number } = {},
  ): FuncOp {
    for (const block of this.allBlocks()) {
      const start =
        options.skipBlock === block && options.skipInstructionIndex !== undefined
          ? options.skipInstructionIndex
          : 0;
      // Rewrite non-terminator ops uniformly — structured ops are
      // ordinary ops in the same list.
      for (let i = start; i < block.operations.length; i++) {
        const op = block.operations[i];
        const rewritten = op.rewrite(values);
        if (rewritten !== op) {
          block.replaceOp(op, rewritten);
          if (rewritten.place !== undefined) {
          }
        }
      }
      if (block.terminal) {
        const rewrittenTerminal = block.terminal.rewrite(values);
        if (rewrittenTerminal !== block.terminal) {
          block.replaceOp(block.terminal, rewrittenTerminal);
        }
      }
    }

    return this;
  }

  private registerAdditionalDefinitionPlaces(
    instr: Operation,
    map: Map<Value, Value>,
    environment: ModuleIR["environment"],
  ): void {
    for (const def of instr.getDefs()) {
      if (def === instr.place! || map.has(def)) {
        continue;
      }
      map.set(def, environment.createValue());
    }
  }
}
