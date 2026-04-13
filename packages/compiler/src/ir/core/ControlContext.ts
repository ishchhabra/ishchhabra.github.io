import { BlockId } from "./Block";

/**
 * Frontend control stack entry. Tracks the closest enclosing
 * loop / switch / labeled block that a `break` / `continue` statement
 * can target.
 *
 * The `structured` flag distinguishes structured ops (BlockOp,
 * LabeledBlockOp, ForOfOp, ForInOp) — which CFG analysis resolves via
 * region-based structural successors and which therefore use
 * `BreakOp` / `ContinueOp` — from flat constructs (while, for, do-while,
 * switch) which still use raw `JumpOp(target)` because they have no
 * enclosing structure op for the analysis to walk up to.
 */
export type ControlContext =
  | {
      kind: "loop";
      label?: string;
      breakTarget: BlockId;
      continueTarget: BlockId;
      structured?: boolean;
    }
  | { kind: "switch"; label?: string; breakTarget: BlockId; structured?: boolean }
  | { kind: "label"; label: string; breakTarget: BlockId; structured?: boolean };
