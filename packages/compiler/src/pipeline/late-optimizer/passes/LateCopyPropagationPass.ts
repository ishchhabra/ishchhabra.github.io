import {
  BindingDeclOp,
  BindingInitOp,
  BlockId,
  DeclarationId,
  LoadLocalOp,
  StoreContextOp,
  Value,
  StoreLocalOp,
} from "../../../ir";
import { FuncOp } from "../../../ir/core/FuncOp";
import type { Operation } from "../../../ir/core/Operation";
import { FunctionPassBase } from "../../FunctionPassBase";
import type { PassResult } from "../../PassManager";

/**
 * Late local copy cleanup.
 *
 * Removes redundant local variable copies left behind by SSA
 * elimination by rewriting local loads to read the original source
 * binding when every processed predecessor agrees on that copy fact.
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
export class LateCopyPropagationPass extends FunctionPassBase {
  constructor(protected readonly funcOp: FuncOp) {
    super(funcOp);
  }

  /**
   * Executes a single forward dataflow iteration over the CFG.
   *
   * The outer optimization framework repeatedly invokes `step()` until
   * a fixpoint is reached (no further rewrites occur).
   */
  protected step(): PassResult {
    /** Map from block → copy state leaving that block. */
    const outState = new Map<BlockId, CopyState>();

    let changed = false;

    for (const block of this.funcOp.blocks) {
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
    const block = this.funcOp.blocks.find((candidate) => candidate.id === blockId);
    const preds = block?.predecessors();

    if (!preds || preds.size === 0) {
      return new Map();
    }

    let result: CopyState | undefined;

    for (const pred of preds) {
      const predState = outState.get(pred.id);
      if (!predState) return new Map();

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
    if (instr instanceof BindingDeclOp) {
      this.kill(state, instr.place.declarationId);
      return;
    }

    if (instr instanceof BindingInitOp) {
      this.recordCopy(state, instr.place, instr.value);
      return;
    }

    if (instr instanceof StoreLocalOp) {
      this.recordCopy(state, instr.lval, instr.value);
      return;
    }

    if (instr instanceof StoreContextOp) {
      this.kill(state, instr.lval.declarationId);
      return;
    }
  }

  private recordCopy(state: CopyState, target: Value, value: Value): void {
    const x = target.declarationId;
    this.kill(state, x);

    if (this.isContextDeclaration(x)) return;
    if (!this.isDirectBindingValue(value)) return;

    const resolved = this.resolve(state, value.declarationId) ?? value;
    if (resolved.declarationId !== x) {
      state.set(x, resolved);
    }
  }

  private isDirectBindingValue(value: Value): boolean {
    if (this.isContextDeclaration(value.declarationId)) return false;

    const definer = value.def;
    return (
      definer === undefined ||
      definer instanceof BindingDeclOp ||
      definer instanceof BindingInitOp ||
      definer instanceof LoadLocalOp
    );
  }

  private isContextDeclaration(declarationId: DeclarationId): boolean {
    return this.funcOp.moduleIR.environment.contextDeclarationIds.has(declarationId);
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
