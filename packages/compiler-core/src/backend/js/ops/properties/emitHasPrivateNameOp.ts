import type { HasPrivateNameOp } from "../../../../ir/ops/properties/HasPrivateNameOp";
import { binaryExpression, expressionStatement, privateIdentifier, type ESTreeStatement } from "../../ast";
import type { CodegenContext } from "../../CodegenContext";

export function emitHasPrivateNameOp(
  context: CodegenContext,
  op: HasPrivateNameOp,
): ESTreeStatement[] {
  const expression = binaryExpression(
    "in",
    privateIdentifier(op.name.name),
    context.expressionForValue(op.object),
  );
  context.values.set(op.result, expression);

  if (op.result.users.size === 0) {
    return [expressionStatement(expression)];
  }

  return [];
}
