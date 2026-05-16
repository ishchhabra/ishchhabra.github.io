import type { YieldExpressionOp } from "../../../../ir/ops/generators/YieldExpressionOp";
import { expressionStatement, yieldExpression, type ESTreeStatement } from "../../ast";
import type { CodegenContext } from "../../CodegenContext";

/**
 * Caches the JavaScript expression for a yield result.
 */
export function emitYieldExpressionOp(
  context: CodegenContext,
  op: YieldExpressionOp,
): ESTreeStatement[] {
  const expression = yieldExpression(
    op.argument === null ? null : context.expressionForValue(op.argument),
    op.delegate,
  );
  context.values.set(op.result, expression);

  return op.result.users.size === 0 ? [expressionStatement(expression)] : [];
}
