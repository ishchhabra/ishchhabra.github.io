import type { AwaitExpressionOp } from "../../../../ir/ops/async/AwaitExpressionOp";
import { awaitExpression, type ESTreeStatement } from "../../ast";
import type { CodegenContext } from "../../CodegenContext";
import { emitExpressionResult } from "../emitExpressionResult";

/**
 * Caches the JavaScript expression for an await result.
 */
export function emitAwaitExpressionOp(
  context: CodegenContext,
  op: AwaitExpressionOp,
): ESTreeStatement[] {
  return emitExpressionResult(
    context,
    op,
    awaitExpression(context.expressionForValue(op.argument)),
  );
}
