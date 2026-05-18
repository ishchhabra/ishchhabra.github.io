import type { UnaryOp } from "../../../../ir/ops/operators/UnaryOp";
import { expressionStatement, unaryExpression, type ESTreeStatement } from "../../ast";
import type { CodegenContext } from "../../CodegenContext";

export function emitUnaryOp(context: CodegenContext, op: UnaryOp): ESTreeStatement[] {
  const expression = unaryExpression(op.operator, context.expressionForValue(op.argument));
  context.values.set(op.result, expression);

  if (op.result.users.size === 0) {
    return [expressionStatement(expression)];
  }

  return [];
}
