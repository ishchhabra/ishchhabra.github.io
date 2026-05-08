import type { HasPrivateNameOp } from "../../../../ir/ops/properties/HasPrivateNameOp";
import { binaryExpression, privateIdentifier, type ESTreeStatement } from "../../ast";
import type { CodegenContext } from "../../CodegenContext";

export function emitHasPrivateNameOp(
  context: CodegenContext,
  op: HasPrivateNameOp,
): ESTreeStatement[] {
  context.values.set(
    op.result,
    binaryExpression("in", privateIdentifier(op.name.name), context.expressionForValue(op.object)),
  );

  return [];
}
