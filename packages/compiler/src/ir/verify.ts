/**
 * Whole-function IR verification. Walks every op in a {@link FuncOp}
 * and calls `op.verify()` on each. Also asserts function-level
 * invariants like "every block has a terminal" and "every successor
 * block named by a terminal is a known block".
 *
 * Used by pass infrastructure at pass boundaries in debug builds, and
 * unconditionally at the end of the pipeline. Throws on the first
 * violation with a descriptive error.
 */

import type { BasicBlock } from "./core/Block";
import type { FuncOp } from "./core/FuncOp";
import { VerifyError } from "./core/Operation";
import { TermOp } from "./core/TermOp";

/**
 * Enable `Operation.verify()` at IR construction paths and pass
 * boundaries. Mirrors MLIR/LLVM's `-DLLVM_ENABLE_ASSERTIONS=ON`: on
 * in debug/test builds, off in production.
 */
export const VERIFY_IR: boolean =
  typeof process !== "undefined" &&
  (process.env.VITEST === "true" || process.env.NODE_ENV === "test");

export function verifyFunction(funcOp: FuncOp): void {
  const knownBlocks = new Set<BasicBlock>(funcOp.blocks);

  for (const block of funcOp.blocks) {
    for (const op of block.getAllOps()) op.verify();
  }

  for (const block of funcOp.blocks) {
    if (block.terminal === undefined) {
      throw new Error(`IR verify: block bb${block.id} has no terminal`);
    }
  }

  for (const block of funcOp.blocks) {
    for (const op of block.getAllOps()) {
      if (!(op instanceof TermOp)) continue;
      for (const successor of op.targets()) {
        if (!knownBlocks.has(successor.block)) {
          throw new VerifyError(op, `references non-existent block bb${successor.block.id}`);
        }
      }
    }
  }
}
