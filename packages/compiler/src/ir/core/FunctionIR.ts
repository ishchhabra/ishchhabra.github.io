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
  ) {
    this.computeCFG();
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
}
