import { Environment } from "../../../environment";
import { FunctionDeclarationInstruction, StoreLocalInstruction } from "../../../ir";
import { FunctionIR } from "../../../ir/core/FunctionIR";
import { AnalysisManager } from "../../analysis/AnalysisManager";
import { DefUseAnalysis } from "../../analysis/DefUseAnalysis";
import { BaseOptimizationPass, OptimizationResult } from "../OptimizationPass";

/**
 * Late Dead Code Elimination — cleanup pass after SSA elimination.
 *
 * Removes pure instructions whose defined place has no readers. Uses
 * the cached DefUseAnalysis (which includes structure reads) to
 * determine what is used.
 *
 * The base class re-runs `step()` until fixpoint so that chains of dead
 * instructions are cleaned up across iterations.
 */
export class LateDeadCodeEliminationPass extends BaseOptimizationPass {
  constructor(
    protected readonly functionIR: FunctionIR,
    private readonly environment: Environment,
    private readonly AM: AnalysisManager,
  ) {
    super(functionIR);
  }

  protected step(): OptimizationResult {
    let changed = false;
    const defUse = this.AM.get(DefUseAnalysis, this.functionIR);

    for (const block of this.functionIR.blocks.values()) {
      const before = block.instructions.length;
      block.instructions = block.instructions.filter((instr) => {
        if (instr.hasSideEffects(this.environment)) {
          return true;
        }

        if (instr instanceof FunctionDeclarationInstruction) {
          return defUse.isUsed(instr.identifier.identifier.id);
        }

        if (instr instanceof StoreLocalInstruction) {
          if (instr.getWrittenPlaces().some((p) => defUse.isUsed(p.identifier.id))) {
            return true;
          }

          // If the value is produced by an impure instruction, keep the
          // store to anchor the side effect to the codegen output.
          const definer = defUse.getDefiner(instr.value.identifier.id);
          if (definer && !definer.isPure(this.environment)) {
            return true;
          }

          return false;
        }

        return instr.getWrittenPlaces().some((p) => defUse.isUsed(p.identifier.id));
      });

      if (block.instructions.length !== before) {
        changed = true;
      }
    }

    if (changed) {
      this.AM.invalidateFunction(this.functionIR);
    }

    return { changed };
  }
}
