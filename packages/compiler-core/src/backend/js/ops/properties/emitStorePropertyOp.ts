import type { StorePropertyOp } from "../../../../ir/ops/properties/StorePropertyOp";
import {
  assignmentExpression,
  expressionStatement,
  identifier,
  memberExpression,
  type ESTreeStatement,
} from "../../ast";
import type { CodegenContext } from "../../CodegenContext";

export function emitStorePropertyOp(
  context: CodegenContext,
  op: StorePropertyOp,
): ESTreeStatement[] {
  const expression = assignmentExpression(
    memberExpression(
      context.expressionForValue(op.object),
      op.key.kind === "static" ? identifier(op.key.name) : context.expressionForValue(op.key.value),
      op.key.kind === "computed",
    ),
    context.expressionForValue(op.value),
  );
  const result = op.results[0];

  if (result !== undefined) {
    context.values.set(result, expression);
    if (result.users.size > 0) return [];
  }

  return [expressionStatement(expression)];
}
