import type { BinaryOp } from "../../../../ir/ops/operators/BinaryOp";
import { binaryExpression, type ESTreeStatement } from "../../ast";
import type { CodegenContext } from "../../CodegenContext";

export function emitBinaryOp(context: CodegenContext, op: BinaryOp): ESTreeStatement[] {
  context.values.set(
    op.result,
    binaryExpression(
      op.operator,
      context.expressionForValue(op.left),
      context.expressionForValue(op.right),
    ),
  );

  return [];
}
