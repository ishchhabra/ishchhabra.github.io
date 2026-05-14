import type { AwaitExpression } from "oxc-parser";

import type { Value } from "../../ir/core/Value";
import { AwaitExpressionOp } from "../../ir/ops/async/AwaitExpressionOp";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";
import { lowerExpression } from "./lowerExpression";

/**
 * Lowers an ECMAScript `await` expression.
 */
export function lowerAwaitExpression(
  builder: FunctionIRBuilder,
  expression: AwaitExpression,
): Value {
  const argument = lowerExpression(builder, expression.argument);
  const result = builder.createValue();

  builder.emit(new AwaitExpressionOp(builder.operationId(), argument, result));

  return result;
}
