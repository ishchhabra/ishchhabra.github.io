import type { HasPrivateNameOp } from "../../../../ir/ops/properties/HasPrivateNameOp";
import { binaryExpression, privateIdentifier, type ESTreeStatement } from "../../ast";
import type { CodegenContext } from "../../CodegenContext";
import { emitExpressionResult } from "../emitExpressionResult";

export function emitHasPrivateNameOp(
  context: CodegenContext,
  op: HasPrivateNameOp,
): ESTreeStatement[] {
  return emitExpressionResult(
    context,
    op,
    binaryExpression("in", privateIdentifier(op.name.name), context.expressionForValue(op.object)),
  );
}
