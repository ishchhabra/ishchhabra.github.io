import { Environment } from "../../../environment";
import { FunctionIR } from "../../../ir/core/FunctionIR";
import { BaseOptimizationPass, OptimizationResult } from "../OptimizationPass";

/**
 * Textbook dead code elimination.
 *
 * An instruction is dead if:
 *   1. It has no side effects, AND
 *   2. None of its written places have any uses.
 *
 * Dead instructions are removed. The base class re-runs `step()` until
 * fixpoint so that chains of dead instructions are cleaned up: removing
 * instruction A may make instruction B (which only existed to feed A)
 * dead as well.
 *
 * Use-chains (`Identifier.uses`) are maintained automatically by
 * `BasicBlock.removeInstructionAt()`.
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
      // Iterate backward so removals don't shift unprocessed indices.
      for (let i = block.instructions.length - 1; i >= 0; i--) {
        const instr = block.instructions[i];

        // Keep instructions with side effects.
        if (instr.hasSideEffects(this.environment)) continue;

        // Keep instructions where any written place is still used.
        if (instr.getWrittenPlaces().some((p) => p.identifier.uses.size > 0)) continue;

        block.removeInstructionAt(i);
        changed = true;
      }
    }

    return { changed };
  }
}
