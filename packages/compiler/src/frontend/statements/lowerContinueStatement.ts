import type { ContinueStatement } from "oxc-parser";
import { blockTarget } from "../../ir/core/TerminatorOp";
import { JumpTerminatorOp } from "../../ir/ops/control/JumpTerminatorOp";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";

/**
 * Lowers `continue` to a jump to the nearest matching loop continuation target.
 */
export function lowerContinueStatement(
  builder: FunctionIRBuilder,
  statement: ContinueStatement,
): void {
  const target = builder.continueTarget(statement.label?.name ?? null);

  builder.terminate(new JumpTerminatorOp(builder.operationId(), blockTarget(target)));
}
