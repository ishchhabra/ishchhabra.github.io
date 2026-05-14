import type { ReturnStatement } from "oxc-parser";

import { ReturnTerminatorOp } from "../../ir/ops/control/ReturnTerminatorOp";
import { lowerExpression } from "../expressions/lowerExpression";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";

/**
 * Lowers a function return.
 */
export function lowerReturnStatement(builder: FunctionIRBuilder, statement: ReturnStatement): void {
  const value = statement.argument === null ? null : lowerExpression(builder, statement.argument);

  builder.terminate(new ReturnTerminatorOp(builder.operationId(), value));
}
