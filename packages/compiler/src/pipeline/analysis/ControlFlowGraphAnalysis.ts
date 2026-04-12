import { BlockId } from "../../ir";
import { getPredecessors, getSuccessors } from "../../frontend/cfg";
import type { FunctionIR } from "../../ir/core/FunctionIR";
import { AnalysisManager, FunctionAnalysis } from "./AnalysisManager";

/**
 * Per-function control-flow graph: predecessor and successor sets per block.
 *
 * Built from {@link FunctionIR#blocks}, {@link FunctionIR#structures}, and
 * block terminals (LLVM: CFG edges). Obtain via {@link AnalysisManager#get}
 * with {@link ControlFlowGraphAnalysis}. The static {@link ControlFlowGraph.compute}
 * is used by that analysis (and in tests); pipeline code should use the manager.
 */
export class ControlFlowGraph {
  private constructor(
    /**
     * Predecessor block IDs for each block (inverse of successor edges).
     */
    readonly predecessors: Map<BlockId, Set<BlockId>>,
    /**
     * Successor block IDs for each block (derived from terminals and structures).
     */
    readonly successors: Map<BlockId, Set<BlockId>>,
  ) {}

  /**
   * Builds pred/succ maps for the current {@link FunctionIR} shape.
   */
  static compute(functionIR: FunctionIR): ControlFlowGraph {
    const predecessors = getPredecessors(functionIR.blocks, functionIR.structures);
    const successors = getSuccessors(predecessors);
    return new ControlFlowGraph(predecessors, successors);
  }

  /**
   * Block with no outgoing CFG edges (unique exit in a well-formed single-exit region).
   */
  getExitBlockId(): BlockId {
    for (const [blockId, succs] of this.successors) {
      if (succs.size === 0) {
        return blockId;
      }
    }
    throw new Error("No exit block found");
  }
}

/**
 * Cached {@link ControlFlowGraph} for a function.
 *
 * Invalidate via {@link AnalysisManager#invalidateFunction} after any change to
 * {@link FunctionIR#blocks}, {@link FunctionIR#structures}, or block terminals
 * that affects control flow.
 */
export class ControlFlowGraphAnalysis extends FunctionAnalysis<ControlFlowGraph> {
  run(functionIR: FunctionIR, _AM: AnalysisManager): ControlFlowGraph {
    return ControlFlowGraph.compute(functionIR);
  }
}
