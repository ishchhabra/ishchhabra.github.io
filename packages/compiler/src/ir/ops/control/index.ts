/**
 * Control-flow ops. Two flavors:
 *
 *   - **Terminators** (`Trait.Terminator`): flat CFG goto-style ops
 *     that end a basic block. Jump, Branch, Return, Throw, Switch, Try.
 *   - **Structured control-flow** (`Trait.HasRegions`): high-level ops
 *     that group multiple blocks into a single semantic unit. Block
 *     statement, ForIn, ForOf, Ternary, LabeledBlock. These are the
 *     former `BaseStructure` classes.
 *
 * Both sets extend {@link Operation} directly and live under this
 * one directory. Two union types + predicates are exported here so
 * passes can type-narrow:
 *
 *   isTerminal(op)  → op is Terminal
 *   isStructure(op) → op is Structure
 *
 * The old `src/ir/core/Terminal.ts` and `src/ir/core/Structure.ts`
 * files have been deleted — they were remnants of the class-hierarchy
 * world where `BaseTerminal` and `BaseStructure` existed.
 */

// Terminators
export { BranchOp } from "./Branch";
export { BreakOp } from "./Break";
export { ContinueOp } from "./Continue";
export { JumpOp } from "./Jump";
export { ReturnOp } from "./Return";
export { SwitchOp, type SwitchCase } from "./Switch";
export { ThrowOp } from "./Throw";
export { TryOp } from "./Try";

// Structured control flow
export { BlockOp } from "./Block";
export { ForInOp } from "./ForIn";
export { ForOfOp } from "./ForOf";
export { LabeledBlockOp } from "./LabeledBlock";
export { TernaryOp } from "./Ternary";

import { BranchOp } from "./Branch";
import { BreakOp } from "./Break";
import { ContinueOp } from "./Continue";
import { JumpOp } from "./Jump";
import { ReturnOp } from "./Return";
import { SwitchOp } from "./Switch";
import { ThrowOp } from "./Throw";
import { TryOp } from "./Try";
import { BlockOp } from "./Block";
import { ForInOp } from "./ForIn";
import { ForOfOp } from "./ForOf";
import { LabeledBlockOp } from "./LabeledBlock";
import { TernaryOp } from "./Ternary";

/**
 * Type-narrow union of all terminator ops. For trait-aware dispatch
 * on an arbitrary Operation, use `op.hasTrait(Trait.Terminator)`.
 */
export type Terminal =
  | BranchOp
  | BreakOp
  | ContinueOp
  | JumpOp
  | ReturnOp
  | ThrowOp
  | SwitchOp
  | TryOp;

/** Runtime predicate matching the {@link Terminal} union. */
export function isTerminal(op: unknown): op is Terminal {
  return (
    op instanceof BranchOp ||
    op instanceof BreakOp ||
    op instanceof ContinueOp ||
    op instanceof JumpOp ||
    op instanceof ReturnOp ||
    op instanceof ThrowOp ||
    op instanceof SwitchOp ||
    op instanceof TryOp
  );
}

/**
 * Type-narrow union of all structured control-flow ops. For
 * trait-aware dispatch, use `op.hasTrait(Trait.HasRegions)`.
 */
export type Structure = BlockOp | ForInOp | ForOfOp | TernaryOp | LabeledBlockOp;

/** Runtime predicate matching the {@link Structure} union. */
export function isStructure(op: unknown): op is Structure {
  return (
    op instanceof BlockOp ||
    op instanceof ForInOp ||
    op instanceof ForOfOp ||
    op instanceof TernaryOp ||
    op instanceof LabeledBlockOp
  );
}
