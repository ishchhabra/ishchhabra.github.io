import type { Operation } from "./Operation";
import { TermOp } from "./TermOp";

/**
 * Register `op` in the use-lists of every value it reads, every value
 * it defines, and every successor block it references. Called by
 * `BasicBlock` whenever an op is attached (constructor, `appendOp`,
 * `insertOpAt`, `replaceOp`, `terminal` setter) and by
 * `Environment.createOperation` for ops not yet placed in a block.
 *
 * This is the single sanctioned mutation path for the use-lists;
 * `Value._addUse` / `BasicBlock._addUse` / `Value._setDefiner` are
 * documented `@internal` and should not be called from anywhere else.
 */
export function registerUses(op: Operation): void {
  for (const value of op.operands()) {
    value._addUse(op);
  }
  for (const value of op.results()) {
    value._setDefiner(op);
  }
  if (op instanceof TermOp) {
    for (const successor of op.successors()) {
      successor.block._addUse(op);
    }
  }
}

/**
 * Inverse of {@link registerUses}: remove `op` from every use-list
 * it was registered in. Called by `BasicBlock` on detach / replace.
 */
export function unregisterUses(op: Operation): void {
  for (const value of op.operands()) {
    value._removeUse(op);
  }
  for (const value of op.results()) {
    value._clearDefinerIf(op);
  }
  if (op instanceof TermOp) {
    for (const successor of op.successors()) {
      successor.block._removeUse(op);
    }
  }
}
