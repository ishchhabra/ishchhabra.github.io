/**
 * Whole-function IR verification. Walks every op in a {@link FuncOp}
 * and calls `op.verify()` on each. Also asserts function-level
 * invariants like "every block has a terminal" and "every block id in
 * a terminal's getBlockRefs() is a known block".
 *
 * Used by pass infrastructure at pass boundaries in debug builds, and
 * unconditionally at the end of the pipeline. Throws on the first
 * violation with a descriptive error.
 */
import type { BlockId } from "./core/Block";
import type { FuncOp } from "./core/FuncOp";
import { Operation, VerifyError } from "./core/Operation";

export function verifyFunction(funcOp: FuncOp): void {
  const blockIds = new Set<BlockId>(funcOp.blockIds());

  // 1. Every op verifies itself. Block params live on each block
  //    directly (not as ops), so they have no `verify()` to call —
  //    use-chain registration happens at construction. Any
  //    verification of param liveness is covered by LivenessAnalysis.
  const verifyOp = (op: Operation) => {
    op.verify();
  };
  for (const op of funcOp.prologue) verifyOp(op);
  for (const block of funcOp.allBlocks()) {
    // `getAllOps` yields every op in the block — all ordinary
    // instructions plus the terminator. Structured ops are
    // ordinary ops under the textbook MLIR model.
    for (const op of block.getAllOps()) verifyOp(op);
  }

  // 2. Every block has a terminal.
  for (const block of funcOp.allBlocks()) {
    if (block.terminal === undefined) {
      throw new Error(`IR verify: block bb${block.id} has no terminal`);
    }
  }

  // 3. Every block ref points at a block that exists in this function.
  const checkBlockRef = (op: Operation, ref: BlockId) => {
    if (!blockIds.has(ref)) {
      throw new VerifyError(op, `references non-existent block bb${ref}`);
    }
  };
  for (const block of funcOp.allBlocks()) {
    for (const op of block.getAllOps()) {
      for (const ref of op.getBlockRefs()) checkBlockRef(op, ref);
    }
  }
}
