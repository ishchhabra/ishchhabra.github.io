import { getPredecessors, getSuccessors } from "../../frontend/cfg";
import type { Phi } from "../../pipeline/ssa/Phi";
import { FunctionDeclarationOp } from "../ops/func/FunctionDeclaration";
import { ArrowFunctionExpressionOp } from "../ops/func/ArrowFunctionExpression";
import { FunctionExpressionOp } from "../ops/func/FunctionExpression";
import { BasicBlock, BlockId } from "./Block";
import { type DestructureTarget, rewriteDestructureTarget } from "./Destructure";
import { Identifier } from "./Identifier";
import { ModuleIR } from "./ModuleIR";
import {
  type CloneContext,
  makeCloneContext,
  makeOperationId,
  Operation,
  type OperationId,
} from "./Operation";
import { Place } from "./Place";
import { Region } from "./Region";
import { type Structure, TernaryOp } from "../ops/control";

/**
 * Stable id for a {@link FunctionIR}. Since `FunctionIR` is now a
 * proper {@link Operation} (a `FuncOp`-style structured op with a
 * body region), its id IS an {@link OperationId}. The historical
 * `FunctionIRId` name is preserved as a type alias so the rest of the
 * codebase keeps reading naturally.
 */
export type FunctionIRId = OperationId;

export function makeFunctionIRId(id: number): FunctionIRId {
  return makeOperationId(id);
}

export interface FunctionSource {
  header: Operation[];
  params: DestructureTarget[];
}

export interface FunctionRuntime {
  params: Place[];
  paramTargets: DestructureTarget[];
  paramBindings: Place[][];
  prologue: Operation[];
  captureParams: Place[];
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
 * The class is still named `FunctionIR` (rather than `FuncOp`) for
 * historical reasons; it could be renamed in a follow-up cleanup.
 */
export class FunctionIR extends Operation {
  /**
   * SSA phi nodes for this function. Set by SSABuilder after SSA
   * construction. Empty before SSA and after SSA elimination.
   */
  public phis: Set<Phi> = new Set();

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

  get exitBlockId(): BlockId {
    const successors = getSuccessors(getPredecessors(this, this.structures));
    for (const [blockId, succs] of successors) {
      if (succs.size === 0) {
        return blockId;
      }
    }

    throw new Error("No exit block found");
  }

  get exitBlock(): BasicBlock {
    return this.getBlock(this.exitBlockId);
  }

  // -----------------------------------------------------------------------
  // Region-ownership block API
  //
  // `_blocks` is the private O(1) id → block lookup index. The authoritative
  // ownership view is the region tree rooted at `body`: every block lives
  // in exactly one region, and its `parent` back-pointer identifies the
  // containing region. External callers iterate via {@link allBlocks} (or
  // walk `body` / op regions directly) — the flat Map is a perf-only
  // cache kept in sync by {@link addBlock} / {@link removeBlock}.
  // -----------------------------------------------------------------------

  /**
   * Walk every block in this function.
   *
   * Iteration order is the id-index insertion order (i.e. the order in
   * which blocks were created). This matches what the pre-region
   * codebase exposed via `functionIR.blocks.values()` and is the order
   * optimization passes rely on for deterministic behavior.
   *
   * Ownership still lives in the region tree (`body` + structured ops'
   * regions) — every block's `parent` back-pointer identifies the
   * containing region. Use `body.allBlocks()` directly for MLIR-style
   * depth-first region-order traversal.
   */
  *allBlocks(): IterableIterator<BasicBlock> {
    yield* this.blocks.values();
  }

  /** Iterator yielding every block's id in creation order. */
  *blockIds(): IterableIterator<BlockId> {
    yield* this.blocks.keys();
  }

  /** Number of blocks in the function (including nested region blocks). */
  get blockCount(): number {
    return this.blocks.size;
  }

  /** Look up a block by id. Throws if not present. */
  getBlock(blockId: BlockId): BasicBlock {
    const block = this.blocks.get(blockId);
    if (!block) {
      throw new Error(`Block ${blockId} not found in function ${this.id}`);
    }
    return block;
  }

  /** Look up a block by id or return `undefined`. */
  maybeBlock(blockId: BlockId): BasicBlock | undefined {
    return this.blocks.get(blockId);
  }

  /** Return `true` if `blockId` belongs to this function. */
  hasBlock(blockId: BlockId): boolean {
    return this.blocks.has(blockId);
  }

  private get runtimePrologueMatchesSourceHeader(): boolean {
    return (
      this.runtime.prologue.length === this.source.header.length &&
      this.runtime.prologue.every((instruction, index) => instruction === this.source.header[index])
    );
  }

  /**
   * Private O(1) id-indexed block map.
   *
   * Ownership of blocks lives in the region tree (`body` +
   * structured ops' regions); this Map is a synchronized id index
   * and iteration-order cache kept in sync via {@link addBlock} /
   * {@link removeBlock}.
   */
  private readonly blocks: Map<BlockId, BasicBlock>;

  constructor(
    /**
     * The {@link ModuleIR} this function belongs to. Set at construction
     * and never changed.
     */
    public readonly moduleIR: ModuleIR,
    id: FunctionIRId,
    public readonly source: FunctionSource,
    public readonly runtime: FunctionRuntime,
    /** Whether the function is `async`. */
    public readonly async: boolean,
    /** Whether the function is a generator (`function*`, etc.). */
    public readonly generator: boolean,
    blocks: Map<BlockId, BasicBlock>,
    initialStructures: Map<BlockId, Structure>,
    /**
     * Maps header (test/back-edge) block IDs to label names for
     * while/for/do-while loops. These loops are reconstructed from
     * back-edges during codegen and have no dedicated structure or
     * terminal to carry the label.
     */
    public readonly blockLabels: Map<BlockId, string> = new Map(),
  ) {
    // Build the body region BEFORE calling super() so we can pass it
    // as the FuncOp's regions[0]. Skip any block already claimed by a
    // structured op's region (frontend reparents body blocks into
    // structure regions during construction).
    const bodyBlocks: BasicBlock[] = [];
    for (const block of blocks.values()) {
      if (block.parent !== null) continue;
      bodyBlocks.push(block);
    }
    const bodyRegion = new Region(bodyBlocks);

    super(id, [bodyRegion]);

    this.blocks = blocks;

    // Attach each initial structure to its header block. The
    // `structures` getter derives the map from `block.structure`.
    for (const [blockId, structure] of initialStructures) {
      const block = this.blocks.get(blockId);
      if (block !== undefined) {
        block.structure = structure;
      }
    }

    moduleIR.functions.set(id, this);
  }

  // -----------------------------------------------------------------------
  // Operation contract — FuncOp implements the abstract Operation methods
  // with function-specific behavior.
  // -----------------------------------------------------------------------

  /** A function-as-op has no SSA operands at the op level. */
  override getOperands(): Place[] {
    return [];
  }

  /**
   * Add a block to the function's top-level body region (or the
   * specified region). Updates both the region tree and the private
   * id index.
   */
  addBlock(block: BasicBlock, region: Region = this.body): void {
    region.appendBlock(block);
    this.blocks.set(block.id, block);
  }

  /**
   * Remove a block from its parent region and from the id index.
   */
  removeBlock(blockId: BlockId): void {
    const block = this.blocks.get(blockId);
    if (block === undefined) return;
    if (block.parent !== null) {
      block.parent.removeBlock(block);
    }
    this.blocks.delete(blockId);
  }

  /**
   * Computed view: `{ headerBlockId → structure op }`. Derived by
   * scanning every block's `structure` field. Replaces the old
   * `structures` side map — there is no canonical storage on
   * `FunctionIR` anymore; each block owns its own structure.
   *
   * The returned map is fresh on each call (safe to mutate, though
   * mutating won't persist). For writes, use {@link setStructure} /
   * {@link deleteStructure} which update the owning block.
   */
  get structures(): ReadonlyMap<BlockId, Structure> {
    const out = new Map<BlockId, Structure>();
    for (const block of this.allBlocks()) {
      if (block.structure !== undefined) {
        out.set(block.id, block.structure as Structure);
      }
    }
    return out;
  }

  public *getRuntimeOpLists(): IterableIterator<readonly Operation[]> {
    yield this.runtime.prologue;
    for (const block of this.allBlocks()) {
      yield block.operations;
    }
  }

  public *getDefinitionOpLists(): IterableIterator<readonly Operation[]> {
    yield this.runtime.prologue;
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
    for (const instr of this.runtime.prologue) {
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
   * Rewrite all instructions and terminals across all blocks using the
   * given identifier → place mapping (delegates to {@link BasicBlock.rewriteAll}).
   */
  rewriteAllBlocks(values: Map<Identifier, Place>): void {
    for (const block of this.allBlocks()) {
      block.rewriteAll(values);
    }
  }

  public hasExternalReferences(): boolean {
    const ownPlaceIds = new Set<number>();

    for (const param of this.runtime.params) {
      ownPlaceIds.add(param.identifier.id);
    }
    for (const bindings of this.runtime.paramBindings) {
      for (const binding of bindings) {
        ownPlaceIds.add(binding.identifier.id);
      }
    }
    for (const captureParam of this.runtime.captureParams) {
      ownPlaceIds.add(captureParam.identifier.id);
    }
    for (const instr of this.runtime.prologue) {
      ownPlaceIds.add(instr.place!.identifier.id);
    }
    for (const block of this.allBlocks()) {
      for (const instr of block.operations) {
        ownPlaceIds.add(instr.place!.identifier.id);
      }
    }

    for (const instr of this.runtime.prologue) {
      for (const place of instr.getOperands()) {
        if (!ownPlaceIds.has(place.identifier.id)) {
          return true;
        }
      }
    }
    for (const block of this.allBlocks()) {
      for (const instr of block.operations) {
        for (const place of instr.getOperands()) {
          if (!ownPlaceIds.has(place.identifier.id)) {
            return true;
          }
        }
      }
      if (block.terminal) {
        for (const place of block.terminal.getOperands()) {
          if (!ownPlaceIds.has(place.identifier.id)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  public findOwningTernary(
    blockId: BlockId,
  ): { headerBlockId: BlockId; structure: TernaryOp } | null {
    for (const [headerBlockId, structure] of this.structures) {
      if (
        structure instanceof TernaryOp &&
        (structure.consequent === blockId || structure.alternate === blockId)
      ) {
        return { headerBlockId, structure };
      }
    }
    return null;
  }

  // -----------------------------------------------------------------------
  // Structure mutations — maintain Identifier.uses
  // -----------------------------------------------------------------------

  /**
   * Add or replace the structure attached to `blockId`. Updates the
   * owning block's `structure` field via its setter, which maintains
   * use-chains automatically.
   */
  setStructure(blockId: BlockId, structure: Structure): void {
    const block = this.blocks.get(blockId);
    if (block === undefined) {
      throw new Error(`FunctionIR.setStructure: unknown block bb${blockId}`);
    }
    block.structure = structure;
  }

  /** Remove the structure attached to `blockId`, if any. */
  deleteStructure(blockId: BlockId): void {
    const block = this.blocks.get(blockId);
    if (block === undefined) return;
    block.structure = undefined;
  }

  /**
   * Function-level deep clone. Implements {@link Operation.clone} —
   * the only piece of the {@link CloneContext} this method consults
   * is `ctx.moduleIR`, which is treated as the target module for the
   * clone. The block / identifier maps in `ctx` are ignored because
   * function-level cloning builds its own from scratch.
   *
   * Callers that previously called `functionIR.clone(targetModule)`
   * should pass `makeCloneContext(targetModule)` to get the same
   * behavior.
   */
  override clone(ctx: CloneContext): FunctionIR {
    const targetModule = ctx.moduleIR;
    const environment = targetModule.environment;
    const blockMap = new Map<BlockId, BlockId>();
    const identifierMap = new Map<Identifier, Place>();
    const newBlocks = new Map<BlockId, BasicBlock>();
    // Function-level clone builds its own cross-block context — the
    // caller-provided `ctx`'s maps are not relevant here.
    const childCtx = makeCloneContext(targetModule);
    (childCtx as { blockMap: Map<BlockId, BlockId> }).blockMap = blockMap;
    (childCtx as { identifierMap: Map<Identifier, Place> }).identifierMap = identifierMap;
    const cloneInstructionList = (instructions: Operation[]): Operation[] => {
      const clonedInstructions: Operation[] = [];
      for (const instr of instructions) {
        const cloned = instr.clone(childCtx);
        identifierMap.set(instr.place!.identifier, cloned.place!);
        this.registerAdditionalDefinitionPlaces(instr, identifierMap, environment);
        clonedInstructions.push(cloned);
      }
      return clonedInstructions;
    };

    const newSourceHeader = cloneInstructionList(this.source.header);
    const newRuntimePrologue = this.runtimePrologueMatchesSourceHeader
      ? newSourceHeader
      : cloneInstructionList(this.runtime.prologue);

    for (const oldBlock of this.blocks.values()) {
      const newBlock = oldBlock.clone(targetModule);
      blockMap.set(oldBlock.id, newBlock.id);
      newBlocks.set(newBlock.id, newBlock);
      for (let i = 0; i < oldBlock.operations.length; i++) {
        identifierMap.set(
          oldBlock.operations[i]!.place!.identifier,
          newBlock.operations[i]!.place!,
        );
        this.registerAdditionalDefinitionPlaces(
          oldBlock.operations[i]!,
          identifierMap,
          environment,
        );
      }
    }

    // Ensure structure and phi identifiers are in the identifierMap
    // BEFORE rewriting instructions.
    // Structures (e.g. TernaryOp.resultPlace) and phi places may
    // reference identifiers created by optimization passes that aren't
    // instruction outputs — they'd be missed by the instruction-based
    // identifierMap population above. Without remapping, the clone's
    // structures would share PlaceIds with the original, causing
    // collisions in CodeGenerator's shared places map.
    for (const structure of this.structures.values()) {
      for (const place of [...structure.getOperands(), ...structure.getDefs()]) {
        if (!identifierMap.has(place.identifier)) {
          identifierMap.set(
            place.identifier,
            environment.createPlace(environment.createIdentifier()),
          );
        }
      }
    }
    for (const phi of this.phis) {
      if (!identifierMap.has(phi.place.identifier)) {
        identifierMap.set(
          phi.place.identifier,
          environment.createPlace(environment.createIdentifier()),
        );
      }
    }

    // Now rewrite all instructions with the complete identifierMap.
    for (let i = 0; i < newSourceHeader.length; i++) {
      newSourceHeader[i] = newSourceHeader[i].rewrite(identifierMap, {
        rewriteDefinitions: true,
      });
    }
    if (newRuntimePrologue !== newSourceHeader) {
      for (let i = 0; i < newRuntimePrologue.length; i++) {
        newRuntimePrologue[i] = newRuntimePrologue[i].rewrite(identifierMap, {
          rewriteDefinitions: true,
        });
      }
    }
    for (const newBlock of newBlocks.values()) {
      newBlock.rewrite(environment, blockMap, identifierMap, { rewriteDefinitions: true });
    }

    const newStructures = new Map<BlockId, Structure>();
    for (const [oldBlockId, oldStructure] of this.structures) {
      newStructures.set(blockMap.get(oldBlockId)!, oldStructure.clone(childCtx) as Structure);
    }
    const newPhis = new Set<Phi>();
    for (const oldPhi of this.phis) {
      newPhis.add(oldPhi.clone(childCtx));
    }

    const remapPlace = (place: Place): Place => identifierMap.get(place.identifier) ?? place;
    const remapTarget = (target: DestructureTarget): DestructureTarget =>
      rewriteDestructureTarget(target, identifierMap, { rewriteDefinitions: true });
    const newSourceParams = this.source.params.map(remapTarget);
    const newRuntimeParams = this.runtime.params.map(remapPlace);
    const newRuntimeParamTargets = this.runtime.paramTargets.map(remapTarget);
    const newRuntimeParamBindings = this.runtime.paramBindings.map((bs) => bs.map(remapPlace));
    const newRuntimeCaptureParams = this.runtime.captureParams.map(remapPlace);
    const newBlockLabels = new Map<BlockId, string>();
    for (const [oldBlockId, label] of this.blockLabels) {
      newBlockLabels.set(blockMap.get(oldBlockId)!, label);
    }

    const newId = makeFunctionIRId(environment.nextFunctionId++);
    const populated = new FunctionIR(
      targetModule,
      newId,
      { header: newSourceHeader, params: newSourceParams },
      {
        params: newRuntimeParams,
        paramTargets: newRuntimeParamTargets,
        paramBindings: newRuntimeParamBindings,
        prologue: newRuntimePrologue,
        captureParams: newRuntimeCaptureParams,
      },
      this.async,
      this.generator,
      newBlocks,
      newStructures,
      newBlockLabels,
    );
    populated.phis = newPhis;

    return populated;
  }

  /**
   * Rewrite all instructions, terminals, structures, and phis across
   * the entire function using the given identifier → place mapping.
   * Implements {@link Operation.rewrite} — function-level rewriting
   * is a deep, in-place sweep of every block and side store; the
   * return value is `this` to satisfy the Operation contract (which
   * permits returning a fresh op for immutable rewrites).
   */
  override rewrite(
    values: Map<Identifier, Place>,
    options: { skipBlock?: BasicBlock; skipInstructionIndex?: number } = {},
  ): FunctionIR {
    for (const block of this.allBlocks()) {
      const start =
        options.skipBlock === block && options.skipInstructionIndex !== undefined
          ? options.skipInstructionIndex
          : 0;
      for (let i = start; i < block.operations.length; i++) {
        const rewritten = block.operations[i].rewrite(values);
        if (rewritten !== block.operations[i]) {
          block.replaceOp(i, rewritten);
          this.moduleIR.environment.placeToOp.set(rewritten.place!.id, rewritten);
        }
      }
      if (block.terminal) {
        block.replaceTerminal(block.terminal.rewrite(values));
      }
    }

    for (const [blockId, structure] of this.structures) {
      const rewritten = structure.rewrite(values);
      if (rewritten !== structure) {
        this.setStructure(blockId, rewritten);
      }
    }

    for (const phi of this.phis) {
      for (const [phiBlockId, operandPlace] of phi.operands) {
        const rewritten = values.get(operandPlace.identifier);
        if (rewritten) {
          phi.operands.set(phiBlockId, rewritten);
        }
      }
    }

    return this;
  }

  private registerAdditionalDefinitionPlaces(
    instr: Operation,
    map: Map<Identifier, Place>,
    environment: ModuleIR["environment"],
  ): void {
    for (const def of instr.getDefs()) {
      if (def.identifier === instr.place!.identifier || map.has(def.identifier)) {
        continue;
      }
      map.set(def.identifier, environment.createPlace(environment.createIdentifier()));
    }
  }
}
