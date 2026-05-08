import type { SequenceExpressionOp } from "../../../../ir/ops/operators/SequenceExpressionOp";
import { sequenceExpression, type ESTreeStatement } from "../../ast";
import type { CodegenContext } from "../../CodegenContext";

export function emitSequenceExpressionOp(
  context: CodegenContext,
  op: SequenceExpressionOp,
): ESTreeStatement[] {
  context.values.set(
    op.result,
    sequenceExpression(op.expressions.map((expression) => context.expressionForValue(expression))),
  );

  return [];
}
