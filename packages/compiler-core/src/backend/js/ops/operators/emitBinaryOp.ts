import type { BinaryOp } from "../../../../ir/ops/operators/BinaryOp";
import { binaryExpression, expressionStatement, type ESTreeStatement } from "../../ast";
import type { CodegenContext } from "../../CodegenContext";

export function emitBinaryOp(context: CodegenContext, op: BinaryOp): ESTreeStatement[] {
  const expression = binaryExpression(
    op.operator,
    context.expressionForValue(op.left),
    context.expressionForValue(op.right),
  );
  context.values.set(op.result, expression);

  if (op.result.users.size === 0) {
    return [expressionStatement(expression)];
  }

  return [];
}
