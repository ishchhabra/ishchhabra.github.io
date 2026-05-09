import { AnalysisManager, PreservedAnalyses } from "../analysis";
import { FunctionIR, Operation } from "../core";
import { TerminatorOp } from "../core/TerminatorOp";
import { canDropOperationEffects } from "../effects";
import { FunctionPass, PassResult } from "./Pass";

/**
 * Creates a pass that removes unused effect-free operations.
 *
 * @example
 * ```txt
 * // Before
 * v0 = ConstantOp(1)
 * v1 = BinaryOp("+", v0, v0)
 * ReturnTerminatorOp(v0)
 *
 * // After
 * v0 = ConstantOp(1)
 * ReturnTerminatorOp(v0)
 * ```
 */
export function createDeadCodeEliminationPass(): FunctionPass {
  return {
    name: "dead-code-elimination",

    run(fn: FunctionIR, _analyses: AnalysisManager): PassResult {
      return new DeadCodeEliminationPass(fn).run();
    },
  };
}

class DeadCodeEliminationPass {
  #changed = false;

  constructor(readonly fn: FunctionIR) {}

  public run(): PassResult {
    let changed = true;
    while (changed) {
      changed = false;

      for (const block of this.fn.blocks) {
        for (const op of Array.from(block.operations)) {
          if (!isDead(op)) continue;

          block.removeOp(op);
          changed = true;
          this.#changed = true;
        }
      }
    }

    return {
      changed: this.#changed,
      preserved: this.#changed ? PreservedAnalyses.none() : undefined,
    };
  }
}

function isDead(op: Operation) {
  if (op instanceof TerminatorOp) return false;

  return hasNoUsedResults(op) && hasNoRequiredEffects(op);
}

function hasNoUsedResults(op: Operation): boolean {
  return op.results.every((result) => result.users.size === 0);
}

function hasNoRequiredEffects(op: Operation): boolean {
  return canDropOperationEffects(op.effects());
}
