import { BlockId } from "./Block";

/**
 * Control stack entry for `break` / `continue` resolution.
 *
 * Frontend: tracks the closest enclosing loop / switch / labeled
 * block that a source-level `break` / `continue` can target. A
 * `structured` flag indicates whether break/continue should be
 * emitted as a structural `BreakTermOp` / `ContinueTermOp` (resolved via
 * region walk at analysis time) or as a raw `JumpTermOp` to an explicit
 * block id (for constructs with internal back-edges that need
 * targeted jumps).
 *
 * Backend: tracks the same, for label selection during codegen.
 *
 * Under the textbook MLIR model every structured control-flow op
 * (IfOp, WhileOp, ForInOp, ForOfOp, BlockOp, LabeledBlockOp,
 * SwitchOp, TryOp) is inline in its parent block — there are no
 * explicit fallthrough blocks — so `breakTarget` / `continueTarget`
 * are `undefined` for structured entries. Legacy flat entries keep
 * the explicit BlockId fields.
 */
export type ControlContext =
  | {
      kind: "loop";
      label?: string;
      breakTarget: BlockId | undefined;
      continueTarget: BlockId | undefined;
      structured?: boolean;
    }
  | {
      kind: "switch";
      label?: string;
      breakTarget: BlockId | undefined;
      structured?: boolean;
    }
  | {
      kind: "label";
      label: string;
      breakTarget: BlockId | undefined;
      structured?: boolean;
    };
