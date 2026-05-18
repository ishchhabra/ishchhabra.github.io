import type { ImportExpressionOp } from "../../../../ir/ops/modules/ImportExpressionOp";
import { expressionStatement, importExpression, type ESTreeStatement } from "../../ast";
import type { CodegenContext } from "../../CodegenContext";

/**
 * Caches the JavaScript expression for a dynamic import result.
 */
export function emitImportExpressionOp(
  context: CodegenContext,
  op: ImportExpressionOp,
): ESTreeStatement[] {
  const expression = importExpression(
    context.expressionForValue(op.source),
    op.options === null ? null : context.expressionForValue(op.options),
  );
  context.values.set(op.result, expression);

  if (op.result.users.size === 0) {
    return [expressionStatement(expression)];
  }

  return [];
}
