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
    for (const place of s.getReadPlaces()) {
      place.identifier.uses.add(s);
    }
    for (const place of s.getWrittenPlaces()) {
      place.identifier.uses.add(s);
    }
  }

  private static unregisterStructure(s: BaseStructure): void {
    for (const place of s.getReadPlaces()) {
      place.identifier.uses.delete(s);
    }
    for (const place of s.getWrittenPlaces()) {
      place.identifier.uses.delete(s);
    }
  }
}
