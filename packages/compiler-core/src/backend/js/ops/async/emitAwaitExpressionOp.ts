import type { AwaitExpressionOp } from "../../../../ir/ops/async/AwaitExpressionOp";
import { awaitExpression, type ESTreeStatement } from "../../ast";
import type { CodegenContext } from "../../CodegenContext";

/**
 * Caches the JavaScript expression for an await result.
 */
export function emitAwaitExpressionOp(
  context: CodegenContext,
  op: AwaitExpressionOp,
): ESTreeStatement[] {
  context.values.set(op.result, awaitExpression(context.expressionForValue(op.argument)));

  return [];
}
