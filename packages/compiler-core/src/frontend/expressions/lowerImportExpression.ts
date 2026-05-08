import type { ImportExpression } from "oxc-parser";
import type { Value } from "../../ir/core/Value";
import { ImportExpressionOp } from "../../ir/ops/modules/ImportExpressionOp";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";
import { lowerExpression } from "./lowerExpression";

/**
 * Lowers an ECMAScript dynamic import expression.
 */
export function lowerImportExpression(
  builder: FunctionIRBuilder,
  expression: ImportExpression,
): Value {
  if (expression.phase !== null) {
    throw new Error(`Import phase is not supported: ${expression.phase}`);
  }

  const source = lowerExpression(builder, expression.source);
  const options = expression.options === null ? null : lowerExpression(builder, expression.options);
  const result = builder.createValue();

  builder.emit(new ImportExpressionOp(builder.operationId(), source, options, result));

  return result;
}
