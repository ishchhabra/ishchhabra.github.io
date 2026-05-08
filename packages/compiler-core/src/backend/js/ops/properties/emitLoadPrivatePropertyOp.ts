import type { LoadPrivatePropertyOp } from "../../../../ir/ops/properties/LoadPrivatePropertyOp";
import {
  expressionStatement,
  memberExpression,
  privateIdentifier,
  type ESTreeStatement,
} from "../../ast";
import type { CodegenContext } from "../../CodegenContext";

export function emitLoadPrivatePropertyOp(
  context: CodegenContext,
  op: LoadPrivatePropertyOp,
): ESTreeStatement[] {
  const expression = memberExpression(
    context.expressionForValue(op.object),
    privateIdentifier(op.name.name),
    false,
  );

  context.values.set(op.result, expression);

  if (op.result.users.size === 0) {
    return [expressionStatement(expression)];
  }

  return [];
}
