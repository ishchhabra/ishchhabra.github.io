import { Environment } from "../../environment";
import { FunctionIR } from "../../ir/core/FunctionIR";
import { AnalysisManager } from "../analysis/AnalysisManager";
import { LivenessAnalysis, LivenessResult } from "../analysis/LivenessAnalysis";
import { BaseOptimizationPass, OptimizationResult } from "../late-optimizer/OptimizationPass";

/**
 * SSA-phase Dead Code Elimination.
 *
 * Removes instructions, phis, and structures whose results are not
 * live. Uses the cached LivenessAnalysis (which transitively propagates
 * through phis and structures) to determine what is safe to remove.
 *
 * The base class re-runs `step()` until fixpoint so that chains of
 * dead definitions are cleaned up across iterations.
 */
export class DeadCodeEliminationPass extends BaseOptimizationPass {
  constructor(
    protected readonly functionIR: FunctionIR,
    private readonly environment: Environment,
    private readonly AM: AnalysisManager,
  ) {
    super(functionIR);
  }

  protected step(): OptimizationResult {
    const liveness = this.AM.get(LivenessAnalysis, this.functionIR);

    const removedStructures = this.removeDeadStructures(liveness);
    const removedPhis = this.removeDeadPhis(liveness);
    const removedInstructions = this.removeDeadInstructions(liveness);

    const changed = removedStructures || removedPhis || removedInstructions;
    if (changed) {
      this.AM.invalidateFunction(this.functionIR);
    }

    return { changed };
  }

  private removeDeadStructures(liveness: LivenessResult): boolean {
    let changed = false;

    for (const [blockId, structure] of this.functionIR.structures) {
      if (structure.hasSideEffects()) continue;
      const isLive = structure.getDefs().some((p) => liveness.isLive(p.identifier.id));
      if (!isLive) {
        this.functionIR.deleteStructure(blockId);
        this.functionIR.recomputeCFG();
        changed = true;
      }
    }

    return changed;
  }

  private removeDeadPhis(liveness: LivenessResult): boolean {
    let changed = false;

    for (const phi of this.functionIR.phis) {
      if (!liveness.isLive(phi.place.identifier.id)) {
        this.functionIR.phis.delete(phi);
        changed = true;
      }
    }

    return changed;
  }

  private removeDeadInstructions(liveness: LivenessResult): boolean {
    let changed = false;

    for (const block of this.functionIR.blocks.values()) {
      for (let i = block.instructions.length - 1; i >= 0; i--) {
        const instr = block.instructions[i];
        if (instr.hasSideEffects(this.environment)) continue;
        if (instr.getDefs().some((p) => liveness.isLive(p.identifier.id))) continue;

        const replacement = instr.asSideEffect();
        if (replacement && replacement.hasSideEffects(this.environment)) {
          block.replaceInstruction(i, replacement);
        } else {
          block.removeInstructionAt(i);
        }
        changed = true;
      }
    }

    return changed;
  }
}
