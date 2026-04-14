import { BlockId } from "../../ir";
import { getPredecessors, getSuccessors } from "../../frontend/cfg";
import type { FuncOp } from "../../ir/core/FuncOp";
import { AnalysisManager, FunctionAnalysis } from "./AnalysisManager";

/**
 * Per-function control-flow graph: predecessor and successor sets per block.
 *
 * Built from {@link FuncOp#blocks}, {@link FuncOp#structures}, and
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
   * Builds pred/succ maps for the current {@link FuncOp} shape.
   */
  static compute(funcOp: FuncOp): ControlFlowGraph {
    const predecessors = getPredecessors(funcOp);
    const successors = getSuccessors(predecessors);
    return new ControlFlowGraph(predecessors, successors);
  }
}

/**
 * Cached {@link ControlFlowGraph} for a function.
 *
 * Invalidate via {@link AnalysisManager#invalidateFunction} after any change to
 * {@link FuncOp#blocks}, {@link FuncOp#structures}, or block terminals
 * that affects control flow.
 */
export class ControlFlowGraphAnalysis extends FunctionAnalysis<ControlFlowGraph> {
  run(funcOp: FuncOp, _AM: AnalysisManager): ControlFlowGraph {
    return ControlFlowGraph.compute(funcOp);
  }
}
