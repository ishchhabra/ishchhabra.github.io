import type { SequenceExpression } from "oxc-parser";

import type { Value } from "../../ir/core/Value";
import { SequenceExpressionOp } from "../../ir/ops/operators/SequenceExpressionOp";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";
import { lowerExpression } from "./lowerExpression";

/**
 * Lowers an ECMAScript sequence expression.
 *
 * Each child expression is lowered left-to-right. The sequence result is the
 * value of the final child expression.
 *
 * @example
 * ```js
 * const value = (first(), second(), third());
 * ```
 */
export function lowerSequenceExpression(
  builder: FunctionIRBuilder,
  expression: SequenceExpression,
): Value {
  if (expression.expressions.length === 0) {
    throw new Error("SequenceExpression must contain at least one expression");
  }

  const expressions = expression.expressions.map((child) => lowerExpression(builder, child));

  const result = builder.createValue();
  builder.emit(new SequenceExpressionOp(builder.operationId(), expressions, result));

  return result;
}
