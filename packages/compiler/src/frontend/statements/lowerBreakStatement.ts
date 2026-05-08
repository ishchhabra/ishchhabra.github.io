import { JumpTerminatorOp } from "../../ir/ops/control/JumpTerminatorOp";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { BreakStatement } from "oxc-parser";
import { blockTarget } from "../../ir/core/TerminatorOp";

/**
 * Lowers `break` to a jump to the nearest matching breaking target.
 */
export function lowerBreakStatement(builder: FunctionIRBuilder, statement: BreakStatement): void {
  const target = builder.breakTarget(statement.label?.name ?? null);

  builder.terminate(new JumpTerminatorOp(builder.operationId(), blockTarget(target)));
}
