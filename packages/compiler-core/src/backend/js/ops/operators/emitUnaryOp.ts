import type { UnaryOp } from "../../../../ir/ops/operators/UnaryOp";
import { unaryExpression, type ESTreeStatement } from "../../ast";
import type { CodegenContext } from "../../CodegenContext";
import { emitExpressionResult } from "../emitExpressionResult";

export function emitUnaryOp(context: CodegenContext, op: UnaryOp): ESTreeStatement[] {
  return emitExpressionResult(
    context,
    op,
    unaryExpression(op.operator, context.expressionForValue(op.argument)),
  );
}
