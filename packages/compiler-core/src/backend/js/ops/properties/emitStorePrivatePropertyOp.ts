import type { StorePrivatePropertyOp } from "../../../../ir/ops/properties/StorePrivatePropertyOp";
import {
  assignmentExpression,
  expressionStatement,
  memberExpression,
  privateIdentifier,
  type ESTreeStatement,
} from "../../ast";
import type { CodegenContext } from "../../CodegenContext";

export function emitStorePrivatePropertyOp(
  context: CodegenContext,
  op: StorePrivatePropertyOp,
): ESTreeStatement[] {
  const expression = assignmentExpression(
    memberExpression(context.expressionForValue(op.object), privateIdentifier(op.name.name), false),
    context.expressionForValue(op.value),
  );
  const result = op.results[0];

  if (result !== undefined) {
    context.values.set(result, expression);
    if (result.users.size > 0) return [];
  }

  return [expressionStatement(expression)];
}
