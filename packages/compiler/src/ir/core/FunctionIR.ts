import {
  getBackEdges,
  getDominanceFrontier,
  getDominators,
  getImmediateDominators,
  getPredecessors,
  getSuccessors,
} from "../../frontend/cfg";
import { BaseInstruction } from "../base";
import { BasicBlock, BlockId } from "./Block";
import { Identifier } from "./Identifier";
import { Place } from "./Place";
import { BaseStructure } from "./Structure";
import { ModuleIR } from "./ModuleIR";
import type { Phi } from "../../pipeline/ssa/Phi";

/**
 * Simulated opaque type for FunctionIR to prevent using normal numbers as ids
 * accidentally.
 */
const opaqueFunctionIRId = Symbol();
export type FunctionIRId = number & { [opaqueFunctionIRId]: "FunctionIRId" };

export function makeFunctionIRId(id: number): FunctionIRId {
  return id as FunctionIRId;
}

export class FunctionIR {
  public predecessors!: Map<BlockId, Set<BlockId>>;
  public successors!: Map<BlockId, Set<BlockId>>;
  public dominators!: Map<BlockId, Set<BlockId>>;
  public immediateDominators!: Map<BlockId, BlockId | undefined>;
  public dominanceFrontier!: Map<BlockId, Set<BlockId>>;
  public backEdges!: Map<BlockId, Set<BlockId>>;

  /**
   * SSA phi nodes for this function. Set by SSABuilder after SSA
   * construction. Empty before SSA and after SSA elimination.
   */
  public phis: Set<Phi> = new Set();

  get entryBlockId(): BlockId {
    return this.blocks.keys().next().value!;
  }

  get entryBlock(): BasicBlock {
    return this.blocks.get(this.entryBlockId)!;
  }

  get exitBlockId(): BlockId {
    for (const [blockId, successors] of this.successors) {
      if (successors.size === 0) {
        return blockId;
      }
    }

    throw new Error("No exit block found");
  }

  get exitBlock(): BasicBlock {
    return this.blocks.get(this.exitBlockId)!;
  }

  constructor(
    /**
     * The {@link ModuleIR} this function belongs to. Set at construction
     * and never changed: a function's owning module is a primary fact
     * about it, the same way a block belongs to a function. Cloning into
     * a different module produces a new {@link FunctionIR} with its own
     * `moduleIR` set to the target — the source's `moduleIR` is never
     * mutated.
     *
     * The constructor self-registers `this` in `moduleIR.functions`, so
     * any `new FunctionIR(...)` is automatically visible to the pipeline
     * and to {@link CodeGenerator}. There is no separate "register" step.
     */
    public readonly moduleIR: ModuleIR,
    public readonly id: FunctionIRId,
    /**
     * A list of instructions executed at the very start of the function. These
     * typically handle parameter initialization such as default values,
     * destructuring, rest/spread setup, etc. Essentially, these instructions
     * ensure the function's parameter `Place`s are fully populated before
     * they are referenced.
     */
    public readonly header: BaseInstruction[],
    public readonly params: Place[],
    /**
     * Per formal parameter: places in the root header instruction `bindings`
     * (e.g. destructuring leaves). Empty for a simple identifier param.
     * Aligned by index with `params`.
     */
    public readonly paramBindings: Place[][],
    /** Whether the function is `async`. */
    public readonly async: boolean,
    /** Whether the function is a generator (`function*`, etc.). */
    public readonly generator: boolean,
    public blocks: Map<BlockId, BasicBlock>,
    public structures: Map<BlockId, BaseStructure>,
    /**
     * Local places inside this function that correspond to captured
     * variables from enclosing scopes. Aligned by index with
     * `captures` on the containing instruction.
     */
    public readonly captureParams: Place[] = [],
    /**
     * Maps header (test/back-edge) block IDs to label names for
     * while/for/do-while loops. These loops are reconstructed from
     * back-edges during codegen and have no dedicated structure or
     * terminal to carry the label.
     *
     * Other labeled constructs carry their label structurally:
     * - `ForInStructure.label` / `ForOfStructure.label`
     * - `LabeledBlockStructure.label`
     * - `SwitchTerminal.label`
     */
    public readonly blockLabels: Map<BlockId, string> = new Map(),
  ) {
    this.computeCFG();
    // Register use-chains for structures passed in at construction time.
    for (const structure of this.structures.values()) {
      FunctionIR.registerStructure(structure);
    }
    // Self-register in the owning module so the pipeline and codegen
    // can find this function via `moduleIR.functions`.
    moduleIR.functions.set(id, this);
  }

  private computeCFG() {
    this.predecessors = getPredecessors(this.blocks, this.structures);
    this.successors = getSuccessors(this.predecessors);
    this.dominators = getDominators(this.predecessors, this.entryBlockId);
    this.immediateDominators = getImmediateDominators(this.dominators);
    this.dominanceFrontier = getDominanceFrontier(this.predecessors, this.immediateDominators);
    this.backEdges = getBackEdges(this.blocks, this.dominators, this.predecessors);
  }

  public recomputeCFG() {
    this.computeCFG();
  }

  /**
   * Look up a block by ID, throwing with context if not found.
   */
  getBlock(blockId: BlockId): BasicBlock {
    const block = this.blocks.get(blockId);
    if (!block) {
      throw new Error(`Block ${blockId} not found in function ${this.id}`);
    }
    return block;
  }

  /**
   * Rewrite all instructions and terminals across all blocks using the
   * given identifier → place mapping (delegates to {@link BasicBlock.rewriteAll}).
   */
  rewriteAllBlocks(values: Map<Identifier, Place>): void {
    for (const block of this.blocks.values()) {
      block.rewriteAll(values);
    }
  }

  // -----------------------------------------------------------------------
  // Structure mutations — maintain Identifier.uses
  // -----------------------------------------------------------------------

  /** Add or replace a structure, maintaining use-chains. */
  setStructure(blockId: BlockId, structure: BaseStructure): void {
    const old = this.structures.get(blockId);
    if (old) FunctionIR.unregisterStructure(old);
    FunctionIR.registerStructure(structure);
    this.structures.set(blockId, structure);
  }

  /** Remove a structure and unregister its use-chains. */
  deleteStructure(blockId: BlockId): void {
    const old = this.structures.get(blockId);
    if (old) FunctionIR.unregisterStructure(old);
    this.structures.delete(blockId);
  }

  private static registerStructure(s: BaseStructure): void {
    for (const place of s.getOperands()) {
      place.identifier.uses.add(s);
    }
    for (const place of s.getDefs()) {
      place.identifier.uses.add(s);
    }
  }

  private static unregisterStructure(s: BaseStructure): void {
    for (const place of s.getOperands()) {
      place.identifier.uses.delete(s);
    }
    for (const place of s.getDefs()) {
      place.identifier.uses.delete(s);
    }
  }

  /**
   * Deep clone this FunctionIR into `targetModule`. Allocates a new
   * FunctionIRId, fresh BlockIds, fresh InstructionIds, and fresh
   * Identifier/Place pairs for every definition. All cross-references
   * (operands, terminal targets, structure block refs, phi operands) are
   * remapped to point at the new entities. The clone's
   * {@link FunctionIR.moduleIR} is set to `targetModule` and the clone
   * self-registers in `targetModule.functions` (via the constructor).
   *
   * `targetModule` defaults to `this.moduleIR`, which is the right answer
   * for intra-module cloning. Cross-module inlining passes the *target*
   * module explicitly so the clone lands in the consumer's registry, not
   * the source's.
   *
   * Two phases:
   *
   *  1. Clone every header/block instruction via `instr.clone(targetModule)`.
   *     Each instruction's clone allocates fresh IDs in
   *     `targetModule.environment` and (for instructions that own a nested
   *     FunctionIR — arrow / function expressions, function declarations)
   *     recursively deep-clones the nested FunctionIR into the same
   *     target module. Cloned instructions still reference old identifiers
   *     and block IDs at this point.
   *  2. Rewrite the accumulated identifier and block maps so the cloned
   *     instructions point at the new entities.
   */
  public clone(targetModule: ModuleIR = this.moduleIR): FunctionIR {
    const environment = targetModule.environment;
    const blockMap = new Map<BlockId, BlockId>();
    const identifierMap = new Map<Identifier, Place>();
    const newBlocks = new Map<BlockId, BasicBlock>();

    // Phase 1: clone the header. Build identifierMap as we go. Each
    // instruction's clone allocates fresh IDs in `targetModule.environment`
    // and recursively deep-clones any nested FunctionIR into targetModule.
    const newHeader: BaseInstruction[] = [];
    for (const instr of this.header) {
      const cloned = instr.clone(targetModule);
      identifierMap.set(instr.place.identifier, cloned.place);
      newHeader.push(cloned);
    }

    // Phase 1: clone every block (cloned instructions + cloned terminal,
    // both still pointing at old refs). Build blockMap and identifierMap.
    for (const [oldBlockId, oldBlock] of this.blocks) {
      const newBlock = oldBlock.clone(targetModule);
      blockMap.set(oldBlockId, newBlock.id);
      newBlocks.set(newBlock.id, newBlock);
      for (let i = 0; i < oldBlock.instructions.length; i++) {
        identifierMap.set(
          oldBlock.instructions[i].place.identifier,
          newBlock.instructions[i].place,
        );
      }
    }

    // Phase 2: rewrite the header and every block through the now-complete
    // maps. Operand identifiers, definition sites, terminal block targets
    // and terminal operands are all fixed up here.
    for (let i = 0; i < newHeader.length; i++) {
      newHeader[i] = newHeader[i].rewrite(identifierMap, { rewriteDefinitions: true });
    }
    for (const newBlock of newBlocks.values()) {
      newBlock.rewrite(environment, blockMap, identifierMap, { rewriteDefinitions: true });
    }

    // Clone structures and phis through both maps.
    const newStructures = new Map<BlockId, BaseStructure>();
    for (const [oldBlockId, oldStructure] of this.structures) {
      newStructures.set(blockMap.get(oldBlockId)!, oldStructure.clone(blockMap, identifierMap));
    }
    const newPhis = new Set<Phi>();
    for (const oldPhi of this.phis) {
      newPhis.add(oldPhi.clone(blockMap, identifierMap));
    }

    // Remap params, paramBindings, captureParams (all reference header
    // instruction places which are now in identifierMap), and block labels.
    const remapPlace = (place: Place): Place => identifierMap.get(place.identifier) ?? place;
    const newParams = this.params.map(remapPlace);
    const newParamBindings = this.paramBindings.map((bs) => bs.map(remapPlace));
    const newCaptureParams = this.captureParams.map(remapPlace);
    const newBlockLabels = new Map<BlockId, string>();
    for (const [oldBlockId, label] of this.blockLabels) {
      newBlockLabels.set(blockMap.get(oldBlockId)!, label);
    }

    // Construct the new FunctionIR. The constructor recomputes the CFG,
    // registers structure use-chains, and self-registers the clone in
    // targetModule.functions.
    const newId = makeFunctionIRId(environment.nextFunctionId++);
    const populated = new FunctionIR(
      targetModule,
      newId,
      newHeader,
      newParams,
      newParamBindings,
      this.async,
      this.generator,
      newBlocks,
      newStructures,
      newCaptureParams,
      newBlockLabels,
    );
    populated.phis = newPhis;

    return populated;
  }
}
