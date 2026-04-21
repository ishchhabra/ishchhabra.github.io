import type { Value } from "./Value";
import type { Operation } from "./Operation";
import type { Region } from "./Region";

/**
 * MLIR-style region-branch interfaces.
 *
 * Modeled after `mlir::RegionBranchOpInterface` and
 * `mlir::RegionBranchTerminatorOpInterface` in LLVM's MLIR
 * framework. Two interfaces co-operate:
 *
 *   - {@link RegionBranchOp} (structured op, e.g. `WhileOp`,
 *     `IfOp`): declares the *control-flow graph* between its
 *     regions. From every {@link RegionBranchPoint} (entering the
 *     op from outside, or leaving a region), the op lists its
 *     successors as {@link RegionSuccessor}s.
 *
 *   - {@link RegionBranchTerminator} (terminator op, e.g.
 *     `YieldOp`, `ConditionOp`, `BreakOp`, `ContinueOp`):
 *     exposes/rewrites its *forwarded operands* — the values it
 *     routes across the region boundary to the successor's block
 *     params or op result places.
 *
 * SSABuilder (and any future region-aware pass — DCE, inliner,
 * dataflow) consumes only these two interfaces. No pass contains
 * any `instanceof WhileOp` / `instanceof ForOp` logic.
 *
 * ## Semantics
 *
 * A region-branch point is either:
 *
 *   - `{ kind: "parent" }` — entering the op from its parent.
 *   - `{ kind: "region"; region: R }` — leaving region `R` via one
 *     of its terminators.
 *
 * From each point, the op can branch to zero or more successors.
 * A successor is either another region (control transfers to that
 * region's entry block, populating its block params) or
 * {@link parentExit} (the op finishes, populating the op's result
 * places).
 *
 * ### What each successor declares
 *
 * - **Target**: a {@link Region} (entry of that region) or
 *   {@link parentExit}.
 * - **Inputs**: on the destination side, which `Value`s receive the
 *   forwarded operands. For a region target, these are that region
 *   entry block's params; for parent-exit, they are the op's result
 *   places. The builder reads this to know which block-param /
 *   result-place slot each forwarded operand lands in.
 *
 * ### What the source side provides
 *
 * - From a **parent** point, the op implements
 *   {@link RegionBranchOp.getEntrySuccessorOperands}: the op-level
 *   operands that forward to each successor's inputs.
 *
 * - From a **region** point, every terminator in that region that
 *   implements {@link RegionBranchTerminator} contributes. Each
 *   terminator exposes `getForwardedOperands()` and
 *   `setForwardedOperands(...)`.
 *
 * ## Invariants
 *
 * 1. For every successor with a region target, the forwarded
 *    operand count must equal the target region's entry-block
 *    param count.
 * 2. For every successor with parent-exit target, the forwarded
 *    operand count must equal the op's result-place count.
 * 3. A given terminator may route to multiple successors (e.g.
 *    `ConditionOp` → body on `true`, parent-exit on `false`). In
 *    our IR, all its successors receive the *same* forwarded
 *    operand list; the terminator's decision input (e.g.
 *    `ConditionOp.value`) is not a forwarded operand.
 *
 * References:
 *   - `mlir::RegionBranchOpInterface` in LLVM
 *     (`mlir/include/mlir/Interfaces/ControlFlowInterfaces.td`).
 *   - `mlir::RegionBranchTerminatorOpInterface` idem.
 *   - MLIR rationale: <https://mlir.llvm.org/docs/Interfaces/
 *     #regionbranchopinterface>.
 */

// ---------------------------------------------------------------------------
// RegionBranchPoint / RegionSuccessor
// ---------------------------------------------------------------------------

/**
 * Sentinel "target" for a successor that exits the op back to its
 * parent. MLIR uses `nullptr` for the same role; we use a string
 * sentinel to stay TypeScript-idiomatic.
 */
export const parentExit = "parent-exit" as const;
export type ParentExit = typeof parentExit;

export type RegionBranchPoint =
  | { readonly kind: "parent" }
  | { readonly kind: "region"; readonly region: Region };

/** Equivalent to `mlir::RegionSuccessor`. */
export interface RegionSuccessor {
  /** Destination: a region's entry (control → that region's entry
   *  block) or {@link parentExit} (control leaves the op). */
  readonly target: Region | ParentExit;
}

// ---------------------------------------------------------------------------
// RegionBranchOp
// ---------------------------------------------------------------------------

/**
 * Structured ops that participate in region-branch analysis.
 * Equivalent to `mlir::RegionBranchOpInterface`.
 *
 * Implementations declare the region-branch graph via
 * {@link getSuccessorRegions} and the op-level operand source for
 * Parent-point edges via {@link getEntrySuccessorOperands}. No
 * other information is needed by the builder — iter-arg allocation,
 * block-param placement, terminator forwarding, and result-place
 * binding are all driven generically from the CFG description.
 */
export interface RegionBranchOp {
  /**
   * Enumerate the successors from a given branch point:
   *
   *   - `{ kind: "parent" }` — where does control go when the op is
   *     entered from the parent block? (Typically the loop's
   *     before/init region; the `if`'s arms; etc.)
   *   - `{ kind: "region"; region: R }` — when control leaves
   *     region `R`, where can it go? (Usually described by R's
   *     terminator kinds: YieldOp → back-edge or parent-exit;
   *     ConditionOp → true-path region + false-path parent-exit.)
   */
  getSuccessorRegions(point: RegionBranchPoint): readonly RegionSuccessor[];

  /**
   * Op-level operand range forwarded to a given Parent-point
   * successor. Analogous to MLIR's
   * `getEntrySuccessorOperands(RegionBranchPoint)`.
   *
   * Some ops (IfOp, ForOp, LabeledBlockOp) have no op-level
   * forwarded operands — they return `[]` regardless.
   */
  getEntrySuccessorOperands(successor: RegionSuccessor): readonly Value[];
}

// ---------------------------------------------------------------------------
// RegionBranchTerminator
// ---------------------------------------------------------------------------

/**
 * Region-terminator ops that route values across the region
 * boundary. Equivalent to
 * `mlir::RegionBranchTerminatorOpInterface`.
 *
 * A terminator implementing this interface declares:
 *
 *   - Which of its operands are *forwarded* — carried across the
 *     region boundary to the selected successor.
 *   - How to reconstruct itself with a replacement operand list
 *     (for SSA lift's iter-arg append step).
 *
 * Terminators that are purely internal CFG edges (e.g.
 * intra-region `JumpOp`) do not implement this interface; their
 * operands are handled by ordinary block-arg rename.
 */
export interface RegionBranchTerminator {
  /**
   * The operands forwarded to whichever {@link RegionSuccessor}
   * this terminator routes to. All successors of a given terminator
   * receive the same list in our IR (e.g. `ConditionOp`'s `args`
   * flow to both true-path and false-path successors).
   *
   * Does *not* include decision inputs such as `ConditionOp.value`.
   */
  getForwardedOperands(): readonly Value[];

  /**
   * Replace the forwarded-operand list in place. Non-forwarded
   * operands (decision inputs) are preserved. Use-def registration
   * is maintained automatically. Matches MLIR's
   * `getMutableSuccessorOperands(...)` style.
   */
  setForwardedOperands(operands: readonly Value[]): void;
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isRegionBranchOp(op: Operation): op is Operation & RegionBranchOp {
  return (
    typeof (op as Partial<RegionBranchOp>).getSuccessorRegions === "function" &&
    typeof (op as Partial<RegionBranchOp>).getEntrySuccessorOperands === "function"
  );
}

export function isRegionBranchTerminator(op: Operation): op is Operation & RegionBranchTerminator {
  return (
    typeof (op as Partial<RegionBranchTerminator>).getForwardedOperands === "function" &&
    typeof (op as Partial<RegionBranchTerminator>).setForwardedOperands === "function"
  );
}
