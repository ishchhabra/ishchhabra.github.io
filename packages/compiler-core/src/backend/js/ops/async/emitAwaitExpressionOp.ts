import type { AwaitExpressionOp } from "../../../../ir/ops/async/AwaitExpressionOp";
import { awaitExpression, expressionStatement, type ESTreeStatement } from "../../ast";
import type { CodegenContext } from "../../CodegenContext";

/**
 * Caches the JavaScript expression for an await result.
 */
export function emitAwaitExpressionOp(
  context: CodegenContext,
  op: AwaitExpressionOp,
): ESTreeStatement[] {
  const expression = awaitExpression(context.expressionForValue(op.argument));
  context.values.set(op.result, expression);

  if (op.result.users.size === 0) {
    return [expressionStatement(expression)];
  }

  return [];
}
