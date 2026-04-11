import {
  BaseInstruction,
  BlockId,
  DeclarationId,
  LoadLocalInstruction,
  Place,
  StoreLocalInstruction,
} from "../../../ir";
import { FunctionIR } from "../../../ir/core/FunctionIR";
import { BaseOptimizationPass, OptimizationResult } from "../OptimizationPass";

/**
 * Forward Copy Propagation.
 *
 * Removes redundant variable copies by rewriting loasd
 * to use the original source variable whenever it is safe to do so.
 *
 * Example:
 *
 *   x = y
 *   z = x
 *
 * becomes:
 *
 *   x = y
 *   z = y
 */
export class LateCopyPropagationPass extends BaseOptimizationPass {
  constructor(protected readonly functionIR: FunctionIR) {
    super(functionIR);
  }

  /**
   * Executes a single forward dataflow iteration over the CFG.
   *
   * The outer optimization framework repeatedly invokes `step()` until
   * a fixpoint is reached (no further rewrites occur).
   */
  protected step(): OptimizationResult {
    /** Map from block → copy state leaving that block. */
    const outState = new Map<BlockId, CopyState>();

    let changed = false;

    for (const [blockId, block] of this.functionIR.blocks) {
      /** Current copy state at block entry (IN[B]). */
      const state = this.meet(blockId, outState);

      for (let i = 0; i < block.instructions.length; i++) {
        const instr = block.instructions[i];

        // ------------------------------------------------------------
        // Rewrite phase
        // ------------------------------------------------------------
        //
        // If we encounter:
        //
        //    load x
        //
        // and the current state says:
        //
        //    x → y
        //
        // we rewrite the load to:
        //
        //    load y
        //

        if (instr instanceof LoadLocalInstruction) {
          const srcDecl = instr.value.identifier.declarationId;
          const resolved = this.resolve(state, srcDecl);

          if (resolved && resolved.identifier.declarationId !== srcDecl) {
            block.replaceInstruction(i, new LoadLocalInstruction(instr.id, instr.place, resolved));

            changed = true;
          }
        }

        // ------------------------------------------------------------
        // Transfer function
        // ------------------------------------------------------------

        this.transfer(instr, state);
      }

      outState.set(blockId, state);
    }

    return { changed };
  }

  /**
   * Meet operator for copy propagation.
   *
   * At a control-flow join we compute:
   *
   *   IN[B] = ⋂ OUT[pred]
   *
   * Only copy relationships that agree across *all* predecessors survive.
   */
  private meet(blockId: BlockId, outState: Map<BlockId, CopyState>): CopyState {
    const preds = this.functionIR.predecessors.get(blockId);

    if (!preds || preds.size === 0) {
      return new Map();
    }

    let result: CopyState | undefined;

    for (const pred of preds) {
      const predState = outState.get(pred);
      if (!predState) continue;

      if (!result) {
        result = new Map(predState);
        continue;
      }

      for (const [dst, src] of result) {
        const other = predState.get(dst);

        if (other !== src) {
          result.delete(dst);
        }
      }
    }

    return result ?? new Map();
  }

  /**
   * Transfer function for a single instruction.
   *
   * Updates the current copy state according to kill/gen rules.
   */
  private transfer(instr: BaseInstruction, state: CopyState): void {
    // ------------------------------------------------------------
    // General assignment
    //
    //   x = expr
    //
    // Kill any previous relationship for x, then remember the current
    // SSA value that x now aliases.
    // ------------------------------------------------------------

    if (instr instanceof StoreLocalInstruction) {
      const x = instr.lval.identifier.declarationId;
      this.kill(state, x);

      // Only record a copy when the value is a direct variable load
      // (const x = y). Propagating through computed values (e.g.
      // AwaitExpression, CallExpression) would cause codegen to re-emit
      // the defining expression at every use site, duplicating side
      // effects and computation.
      const definer = instr.value.identifier.definer;
      if (!(definer instanceof LoadLocalInstruction)) {
        return;
      }

      const resolved = this.resolve(state, instr.value.identifier.declarationId) ?? instr.value;
      if (resolved.identifier.declarationId !== x) {
        state.set(x, resolved);
      }
      return;
    }
  }

  /**
   * Removes all copy relationships involving variable `x`.
   *
   * This includes:
   *
   *   x → *
   *   * → x
   *
   * because redefining `x` invalidates any chain containing it.
   */
  private kill(state: CopyState, x: DeclarationId): void {
    state.delete(x);

    for (const [k, v] of state) {
      if (v.identifier.declarationId === x) {
        state.delete(k);
      }
    }
  }

  /**
   * Resolves a copy chain transitively.
   *
   * Example:
   *
   *   x → y
   *   y → z
   *
   * resolve(x) → z
   *
   * Cycles are prevented using a visited set.
   */
  private resolve(state: CopyState, x: DeclarationId): Place | undefined {
    const visited = new Set<DeclarationId>();
    let current = x;
    let result: Place | undefined;

    while (!visited.has(current)) {
      visited.add(current);

      const next = state.get(current);
      if (!next) break;

      result = next;
      current = next.identifier.declarationId;
    }

    return result;
  }
}

/** Dataflow state mapping variables to the variable they copy.
 *
 * Represents relationships of the form:
 *
 *   x → y
 *
 * meaning `x` currently holds the same value as `y`.
 */
type CopyState = Map<DeclarationId, Place>;
