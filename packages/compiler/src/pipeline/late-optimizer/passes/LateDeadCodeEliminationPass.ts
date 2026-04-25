import { Environment } from "../../../environment";
import { BindingInitOp, Operation, StoreLocalOp } from "../../../ir";
import { FuncOp } from "../../../ir/core/FuncOp";
import { isDeclarationExported } from "../../../ir/exportClaim";
import { BaseOptimizationPass, OptimizationResult } from "../OptimizationPass";

/**
 * Late Dead Code Elimination — cleanup pass after SSA elimination.
 *
 * Removes pure instructions whose defined place has no readers. Uses
 * the embedded {@link Value.users} chain (maintained incrementally
 * by BasicBlock mutation methods) to determine what is used.
 *
 * The base class re-runs `step()` until fixpoint so that chains of dead
 * instructions are cleaned up across iterations.
 *
 * StoreLocal is side-effectful because it writes a binding cell.
 * Side-effectful ops are skipped by the removal loop. When proper
 * Dead Store Elimination lands, stores can drop to side-effect-free
 * and a unified liveness walk will handle both shapes uniformly.
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

    for (const block of this.funcOp.blocks) {
      for (let i = block.operations.length - 1; i >= 0; i--) {
        const instr = block.operations[i];
        if (instr.hasSideEffects(this.environment)) continue;

        // Exports reach their binding via declarationId rather than
        // SSA operand chains, so a store/init to an exported binding
        // looks unused but must stay.
        if (instr instanceof BindingInitOp && isDeclarationExported(this.funcOp, instr.place.declarationId)) {
          continue;
        }
        if (instr instanceof StoreLocalOp && isDeclarationExported(this.funcOp, instr.lval.declarationId)) {
          continue;
        }

        if (instr instanceof StoreLocalOp) {
          if (instr.results().some((p) => p.users.size > 0)) continue;
          const definer = instr.value.def;
          if (definer instanceof Operation && !definer.isPure(this.environment)) continue;
        } else {
          if (instr.results().some((p) => p.users.size > 0)) continue;
        }

        block.removeOpAt(i);
        changed = true;
      }
    }

    return { changed };
  }
}
