import type { Operation } from "./Operation";
import type { Region } from "./Region";
import type { Value } from "./Value";

/**
 * MLIR `LoopLikeOpInterface` — identifies ops whose semantics include
 * an iterated region. Used by passes that reason about loop-carried
 * state (SSA construction, LICM, unrolling), break/continue target
 * resolution, and induction-variable analysis.
 *
 * This is a minimal subset of MLIR's 33-method interface — only the
 * methods we actually consume today. Bounds/step/induction-variable
 * accessors are intentionally omitted because JS loops (`while`,
 * `for(;;)`, `for...in`, `for...of`) are not counted and have no
 * static induction variable — unlike `scf.for`.
 *
 * Reference:
 *   https://github.com/llvm/llvm-project/blob/main/mlir/include/mlir/Interfaces/LoopLikeInterface.td
 */
export interface LoopLikeOpInterface {
  /**
   * The regions that comprise the loop's iterated body. Multiple if
   * the op has structurally distinct regions that all run once per
   * iteration (e.g. WhileOp's before + body; ForOp's cond + body +
   * step). Prelude-like regions (run exactly once on op entry) are
   * NOT included.
   *
   * MLIR: `SmallVector<Region*> getLoopRegions()`.
   */
  getLoopRegions(): readonly Region[];

  /**
   * Mutable iter-arg init slots, one per loop-carried value. These
   * are the op-level operands that supply the first iteration's
   * values for the region-entry block params.
   *
   * Returns the underlying array (caller may mutate in place) — this
   * matches MLIR's `MutableArrayRef<OpOperand>` return. Use
   * {@link setInits} for a structured replacement.
   *
   * MLIR: `MutableArrayRef<OpOperand> getInitsMutable()`.
   */
  getInitsMutable(): readonly Value[];

  /**
   * The values yielded back to the next iteration, if the op has a
   * single yield point. Ops with multiple yield paths (e.g. ForOp's
   * continue vs fall-through) return `undefined` and callers must
   * walk terminators themselves.
   *
   * MLIR: `std::optional<MutableArrayRef<OpOperand>> getYieldedValuesMutable()`.
   */
  getYieldedValuesMutable(): readonly Value[] | undefined;
}

/**
 * Runtime predicate — narrows to `LoopLikeOpInterface` when the op
 * implements the interface. Used in lieu of MLIR's class-hierarchy
 * `dyn_cast<LoopLikeOpInterface>(op)`.
 */
export function isLoopLike(op: Operation): op is Operation & LoopLikeOpInterface {
  const o = op as Partial<LoopLikeOpInterface>;
  return (
    typeof o.getLoopRegions === "function" &&
    typeof o.getInitsMutable === "function" &&
    typeof o.getYieldedValuesMutable === "function"
  );
}
