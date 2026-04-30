import { Environment } from "../../../environment";
import { FuncOp } from "../../../ir/core/FuncOp";
import { isDCERemovable } from "../../../ir/effects/predicates";
import { FunctionPassBase } from "../../FunctionPassBase";
import type { PassResult } from "../../PassManager";

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
export class LateDeadCodeEliminationPass extends FunctionPassBase {
  constructor(
    protected readonly funcOp: FuncOp,
    private readonly environment: Environment,
  ) {
    super(funcOp);
  }

  protected step(): PassResult {
    let changed = false;

    for (const block of this.funcOp.blocks) {
      for (let i = block.operations.length - 1; i >= 0; i--) {
        const instr = block.operations[i];
        if (!isDCERemovable(instr, this.environment)) continue;
        if (instr.results().some((p) => p.users.size > 0)) continue;

        block.removeOpAt(i);
        changed = true;
      }
    }

    return { changed };
  }
}
