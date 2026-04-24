import type { BasicBlock } from "./Block";
import type { Value } from "./Value";

/**
 * An op-shaped user of a {@link Value} or {@link BasicBlock}.
 *
 * Structural on purpose: every `Operation` satisfies this shape, but
 * stating the contract as "any object with these methods" avoids a
 * cyclic import (`Operation` imports `Value` and `BasicBlock`, which
 * both need the user type).
 *
 *   - `operands()` — values this op reads. Always present.
 *   - `results()` — values this op defines. Present on every op that
 *     produces results (instructions); absent on pure terminators
 *     like `BreakTermOp` or `ReturnTermOp`.
 *   - `getBlockRefs()` — blocks this op references as CFG successors.
 *     Present on `JumpTermOp` and anything else that encodes a block
 *     target; absent on ordinary instructions.
 */
export type User = {
  operands(): readonly Value[];
  results?: () => readonly Value[];
  getBlockRefs?: () => readonly BasicBlock[];
};

/**
 * Register `user` in the use-lists of every value it reads, every
 * value it defines, and every block it references. Called by
 * `BasicBlock` whenever an op is attached (constructor, `appendOp`,
 * `insertOpAt`, `replaceOp`, `terminal` setter) and by
 * `Environment.createOperation` for ops not yet placed in a block.
 *
 * This is the single sanctioned mutation path for the use-lists;
 * `Value._addUse` / `BasicBlock._addUse` / `Value._setDefiner` are
 * documented `@internal` and should not be called from anywhere else.
 */
export function registerUses(user: User): void {
  for (const value of user.operands()) {
    value._addUse(user);
  }
  if (user.results) {
    for (const value of user.results()) {
      value._setDefiner(user);
    }
  }
  if (user.getBlockRefs) {
    for (const block of user.getBlockRefs()) {
      block._addUse(user);
    }
  }
}

/**
 * Inverse of {@link registerUses}: remove `user` from every use-list
 * it was registered in. Called by `BasicBlock` on detach / replace.
 */
export function unregisterUses(user: User): void {
  for (const value of user.operands()) {
    value._removeUse(user);
  }
  if (user.results) {
    for (const value of user.results()) {
      value._clearDefinerIf(user);
    }
  }
  if (user.getBlockRefs) {
    for (const block of user.getBlockRefs()) {
      block._removeUse(user);
    }
  }
}
