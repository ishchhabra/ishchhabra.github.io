import type { BasicBlock } from "./core/Block";
import type { FuncOp } from "./core/FuncOp";
import type { Operation } from "./core/Operation";

/**
 * MLIR-style `Operation::walk` — recursively visit every op reachable
 * from a starting point. Pre-order: the visitor sees an op before
 * descending into that op's owned regions.
 *
 * The visitor may return {@link WalkResult.Skip} to avoid recursing
 * into the current op's regions (useful for analyses that treat
 * structured ops opaquely). `void` / any other return value continues.
 *
 * Collapses the "iterate blocks + handle the structures overlay +
 * recurse into nested ops" boilerplate that every pass reinvents.
 */
export const enum WalkResult {
  /** Keep walking normally — recurse into this op's owned regions. */
  Advance = "Advance",
  /** Do not recurse into this op's owned regions. */
  Skip = "Skip",
}

export type WalkVisitor = (op: Operation) => WalkResult | void;

export function walkOp(op: Operation, visit: WalkVisitor): void {
  visit(op);
}

export function walkBlock(block: BasicBlock, visit: WalkVisitor): void {
  // MLIR-style: terminator is logically the last op in the block.
  // getAllOps() yields instructions then terminator in program order.
  for (const op of block.getAllOps()) {
    walkOp(op, visit);
  }
}

/**
 * Walk every op in a function — every block's op list (regular
 * instructions, structured ops, terminator).
 *
 * This is the convenience entry-point for passes that want "touch
 * every op in this function once." Block params are not ops and are
 * not yielded; passes that care about them iterate `block.params`
 * directly.
 */
export function walkFunction(funcOp: FuncOp, visit: WalkVisitor): void {
  for (const block of funcOp.blocks) {
    walkBlock(block, visit);
  }
}
