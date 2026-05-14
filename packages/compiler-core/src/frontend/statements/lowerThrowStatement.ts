import type { ThrowStatement } from "oxc-parser";

import { ThrowTerminatorOp } from "../../ir/ops/control/ThrowTerminatorOp";
import { lowerExpression } from "../expressions/lowerExpression";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";

/**
 * Lowers a JavaScript throw statement.
 */
export function lowerThrowStatement(builder: FunctionIRBuilder, statement: ThrowStatement): void {
  const value = lowerExpression(builder, statement.argument);

  builder.terminate(new ThrowTerminatorOp(builder.operationId(), value));
}
