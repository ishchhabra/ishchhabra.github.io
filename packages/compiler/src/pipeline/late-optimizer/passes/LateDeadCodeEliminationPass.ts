import { Environment } from "../../../environment";
import { BaseInstruction, StoreLocalInstruction } from "../../../ir";
import { FunctionIR } from "../../../ir/core/FunctionIR";
import { BaseOptimizationPass, OptimizationResult } from "../OptimizationPass";

/**
 * Late Dead Code Elimination — cleanup pass after SSA elimination.
 *
 * Removes pure instructions whose defined place has no readers. Uses
 * the embedded {@link Identifier.uses} chain (maintained incrementally
 * by BasicBlock mutation methods) to determine what is used.
 *
 * The base class re-runs `step()` until fixpoint so that chains of dead
 * instructions are cleaned up across iterations.
 */
export class LateDeadCodeEliminationPass extends BaseOptimizationPass {
  constructor(
    protected readonly functionIR: FunctionIR,
    private readonly environment: Environment,
  ) {
    super(functionIR);
  }

  protected step(): OptimizationResult {
    let changed = false;

    for (const block of this.functionIR.blocks.values()) {
      for (let i = block.instructions.length - 1; i >= 0; i--) {
        const instr = block.instructions[i];
        if (instr.hasSideEffects(this.environment)) continue;

        if (instr instanceof StoreLocalInstruction) {
          if (instr.getDefs().some((p) => p.identifier.uses.size > 0)) continue;
          const definer = instr.value.identifier.definer;
          if (definer instanceof BaseInstruction && !definer.isPure(this.environment)) continue;
        } else {
          if (instr.getDefs().some((p) => p.identifier.uses.size > 0)) continue;
        }

        block.removeInstructionAt(i);
        changed = true;
      }
    }

    return { changed };
  }
}
