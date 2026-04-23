import { Operation, BlockId, DeclarationId, LoadLocalOp, Value, StoreLocalOp } from "../../../ir";
import { FuncOp } from "../../../ir/core/FuncOp";
import { Trait } from "../../../ir/core/Operation";
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
  constructor(protected readonly funcOp: FuncOp) {
    super(funcOp);
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

    for (const block of this.funcOp.allBlocks()) {
      const blockId = block.id;
      /** Current copy state at block entry (IN[B]). */
      const state = this.meet(blockId, outState);

      for (const instr of block.operations) {
        if (instr instanceof LoadLocalOp) {
          const srcDecl = instr.value.declarationId;
          const resolved = this.resolve(state, srcDecl);

          if (resolved && resolved.declarationId !== srcDecl) {
            block.replaceOp(instr, new LoadLocalOp(instr.id, instr.place, resolved));
            changed = true;
          }
          continue;
        }

        // Structured ops may mutate variables inside their regions.
        // Conservatively kill every copy relationship involving any
        // decl stored to in any nested region.
        if (instr.hasTrait(Trait.HasRegions)) {
          for (const decl of this.collectStoredDecls(instr)) {
            this.kill(state, decl);
          }
          continue;
        }

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
    const block = this.funcOp.maybeBlock(blockId);
    const preds = block?.predecessors();

    if (!preds || preds.size === 0) {
      return new Map();
    }

    let result: CopyState | undefined;

    for (const pred of preds) {
      const predState = outState.get(pred.id);
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
  private transfer(instr: Operation, state: CopyState): void {
    // ------------------------------------------------------------
    // General assignment
    //
    //   x = expr
    //
    // Kill any previous relationship for x, then remember the current
    // SSA value that x now aliases.
    // ------------------------------------------------------------

    if (instr instanceof StoreLocalOp) {
      const x = instr.lval.declarationId;
      this.kill(state, x);

      // Only record a copy when the value is a direct variable load
      // (const x = y). Propagating through computed values (e.g.
      // AwaitExpression, CallExpression) would cause codegen to re-emit
      // the defining expression at every use site, duplicating side
      // effects and computation.
      const definer = instr.value.definer;
      if (!(definer instanceof LoadLocalOp)) {
        return;
      }

      const resolved = this.resolve(state, instr.value.declarationId) ?? instr.value;
      if (resolved.declarationId !== x) {
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
      if (v.declarationId === x) {
        state.delete(k);
      }
    }
  }

  private collectStoredDecls(op: Operation): Set<DeclarationId> {
    const decls = new Set<DeclarationId>();
    if (op instanceof StoreLocalOp) {
      decls.add(op.lval.declarationId);
    }
    return decls;
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
  private resolve(state: CopyState, x: DeclarationId): Value | undefined {
    const visited = new Set<DeclarationId>();
    let current = x;
    let result: Value | undefined;

    while (!visited.has(current)) {
      visited.add(current);

      const next = state.get(current);
      if (!next) break;

      result = next;
      current = next.declarationId;
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
type CopyState = Map<DeclarationId, Value>;
