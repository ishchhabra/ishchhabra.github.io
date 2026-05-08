import type { YieldExpression } from "oxc-parser";
import type { Value } from "../../ir/core/Value";
import { YieldExpressionOp } from "../../ir/ops/generators/YieldExpressionOp";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";
import { lowerExpression } from "./lowerExpression";

/**
 * Lowers an ECMAScript `yield` or `yield*` expression.
 */
export function lowerYieldExpression(
  builder: FunctionIRBuilder,
  expression: YieldExpression,
): Value {
  const argument =
    expression.argument === null ? null : lowerExpression(builder, expression.argument);
  const result = builder.createValue();

  builder.emit(new YieldExpressionOp(builder.operationId(), argument, expression.delegate, result));

  return result;
}
