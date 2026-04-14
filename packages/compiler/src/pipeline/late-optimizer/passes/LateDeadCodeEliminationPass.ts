import { Environment } from "../../../environment";
import { Operation, StoreLocalOp } from "../../../ir";
import { FuncOp } from "../../../ir/core/FuncOp";
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
    protected readonly funcOp: FuncOp,
    private readonly environment: Environment,
  ) {
    super(funcOp);
  }

  protected step(): OptimizationResult {
    let changed = false;

    for (const block of this.funcOp.allBlocks()) {
      for (let i = block.operations.length - 1; i >= 0; i--) {
        const instr = block.operations[i];
        if (instr.hasSideEffects(this.environment)) continue;

        if (instr instanceof StoreLocalOp) {
          if (instr.getDefs().some((p) => p.identifier.uses.size > 0)) continue;
          const definer = instr.value.identifier.definer;
          if (definer instanceof Operation && !definer.isPure(this.environment)) continue;
        } else {
          if (instr.getDefs().some((p) => p.identifier.uses.size > 0)) continue;
        }

        block.removeOpAt(i);
        changed = true;
      }
    }

    return { changed };
  }
}
