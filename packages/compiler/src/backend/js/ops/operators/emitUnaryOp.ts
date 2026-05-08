import type { UnaryOp } from "../../../../ir/ops/operators/UnaryOp";
import { unaryExpression, type ESTreeStatement } from "../../ast";
import type { CodegenContext } from "../../CodegenContext";

export function emitUnaryOp(context: CodegenContext, op: UnaryOp): ESTreeStatement[] {
  context.values.set(
    op.result,
    unaryExpression(op.operator, context.expressionForValue(op.argument)),
  );

  return [];
}
