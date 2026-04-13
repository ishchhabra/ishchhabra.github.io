/**
 * Whole-function IR verification. Walks every op in a {@link FunctionIR}
 * and calls `op.verify()` on each. Also asserts function-level
 * invariants like "every block has a terminal" and "every block id in
 * a terminal's getBlockRefs() is a known block".
 *
 * Used by pass infrastructure at pass boundaries in debug builds, and
 * unconditionally at the end of the pipeline. Throws on the first
 * violation with a descriptive error.
 */
import type { BlockId } from "./core/Block";
import type { FunctionIR } from "./core/FunctionIR";
import { Operation, VerifyError } from "./core/Operation";

export function verifyFunction(functionIR: FunctionIR): void {
  const blockIds = new Set<BlockId>(functionIR.blockIds());

  // 1. Every op verifies itself.
  const verifyOp = (op: Operation) => {
    op.verify();
  };
  for (const op of functionIR.source.header) verifyOp(op);
  for (const op of functionIR.runtime.prologue) verifyOp(op);
  for (const block of functionIR.allBlocks()) {
    for (const op of block.getAllOps()) verifyOp(op);
  }
  for (const phi of functionIR.phis) verifyOp(phi);
  for (const structure of functionIR.structures.values()) verifyOp(structure);

  // 2. Every block has a terminal.
  for (const block of functionIR.allBlocks()) {
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
  for (const block of functionIR.allBlocks()) {
    if (block.terminal) {
      for (const ref of block.terminal.getBlockRefs()) checkBlockRef(block.terminal, ref);
    }
  }
  for (const structure of functionIR.structures.values()) {
    for (const ref of structure.getBlockRefs()) checkBlockRef(structure, ref);
  }
}
