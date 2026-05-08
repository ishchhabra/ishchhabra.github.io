import type { YieldExpressionOp } from "../../../../ir/ops/generators/YieldExpressionOp";
import { yieldExpression, type ESTreeStatement } from "../../ast";
import type { CodegenContext } from "../../CodegenContext";

/**
 * Caches the JavaScript expression for a yield result.
 */
export function emitYieldExpressionOp(
  context: CodegenContext,
  op: YieldExpressionOp,
): ESTreeStatement[] {
  context.values.set(
    op.result,
    yieldExpression(
      op.argument === null ? null : context.expressionForValue(op.argument),
      op.delegate,
    ),
  );

  return [];
}
