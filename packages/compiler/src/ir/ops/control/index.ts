/**
 * Control-flow ops. Two flavors:
 *
 *   - **Terminators** (`Trait.Terminator`): end a basic block. They
 *     do not own regions. Jump, Return, Throw, Break, Continue, Yield.
 *   - **Structured control-flow** (`Trait.HasRegions`): inline ops
 *     that own one or more regions. They are NOT terminators — they
 *     live in the middle of a block, and control continues with the
 *     next op in the parent block after they finish. If, While,
 *     ForIn, ForOf, Block, LabeledBlock, Switch, Try.
 *
 * Both sets extend {@link Operation} directly.
 */

// Terminators
export { BreakOp } from "./Break";
export { ConditionOp } from "./Condition";
export { ContinueOp } from "./Continue";
export { JumpOp } from "./Jump";
export { ReturnOp } from "./Return";
export { ThrowOp } from "./Throw";
export { YieldOp } from "./Yield";

// Structured control flow
export { BlockOp } from "./Block";
export { ForInOp } from "./ForIn";
export { ForOfOp } from "./ForOf";
export { ForOp } from "./For";
export { IfOp } from "./If";
export { LabeledBlockOp } from "./LabeledBlock";
export { SwitchOp } from "./Switch";
export { TryOp } from "./Try";
export { WhileOp } from "./While";

import { BreakOp } from "./Break";
import { ConditionOp } from "./Condition";
import { ContinueOp } from "./Continue";
import { JumpOp } from "./Jump";
import { ReturnOp } from "./Return";
import { ThrowOp } from "./Throw";
import { YieldOp } from "./Yield";
import { BlockOp } from "./Block";
import { ForInOp } from "./ForIn";
import { ForOfOp } from "./ForOf";
import { ForOp } from "./For";
import { IfOp } from "./If";
import { LabeledBlockOp } from "./LabeledBlock";
import { SwitchOp } from "./Switch";
import { TryOp } from "./Try";
import { WhileOp } from "./While";
export {
  ForInTerm,
  ForOfTerm,
  ForTerm,
  IfTerm,
  LabeledTerm,
  type SwitchCase,
  SwitchTerm,
  TryTerm,
  WhileTerm,
} from "./cfg-terminators";
import {
  ForInTerm,
  ForOfTerm,
  ForTerm,
  IfTerm,
  LabeledTerm,
  SwitchTerm,
  TryTerm,
  WhileTerm,
} from "./cfg-terminators";

/** Union of all terminator ops. */
export type Terminal =
  | BreakOp
  | ConditionOp
  | ContinueOp
  | ForInTerm
  | ForOfTerm
  | ForTerm
  | IfTerm
  | JumpOp
  | LabeledTerm
  | ReturnOp
  | SwitchTerm
  | ThrowOp
  | TryTerm
  | WhileTerm
  | YieldOp;

export function isTerminal(op: unknown): op is Terminal {
  return (
    op instanceof BreakOp ||
    op instanceof ConditionOp ||
    op instanceof ContinueOp ||
    op instanceof ForInTerm ||
    op instanceof ForOfTerm ||
    op instanceof ForTerm ||
    op instanceof IfTerm ||
    op instanceof JumpOp ||
    op instanceof LabeledTerm ||
    op instanceof ReturnOp ||
    op instanceof SwitchTerm ||
    op instanceof ThrowOp ||
    op instanceof TryTerm ||
    op instanceof WhileTerm ||
    op instanceof YieldOp
  );
}

/** Union of all structured control-flow ops. */
export type Structure =
  | BlockOp
  | ForInOp
  | ForOfOp
  | ForOp
  | IfOp
  | LabeledBlockOp
  | SwitchOp
  | TryOp
  | WhileOp;

export function isStructure(op: unknown): op is Structure {
  return (
    op instanceof BlockOp ||
    op instanceof ForInOp ||
    op instanceof ForOfOp ||
    op instanceof ForOp ||
    op instanceof IfOp ||
    op instanceof LabeledBlockOp ||
    op instanceof SwitchOp ||
    op instanceof TryOp ||
    op instanceof WhileOp
  );
}
