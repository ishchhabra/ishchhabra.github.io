import type { ThisExpression } from "oxc-parser";
import type { Value } from "../../ir/core/Value";
import { LoadThisOp } from "../../ir/ops/functions/LoadThisOp";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";

/**
 * Lowers an ECMAScript `this` expression.
 */
export function lowerThisExpression(
  builder: FunctionIRBuilder,
  _expression: ThisExpression,
): Value {
  const result = builder.createValue();
  builder.emit(new LoadThisOp(builder.operationId(), result));
  return result;
}
