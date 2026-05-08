import type { StoreSuperPropertyOp } from "../../../../ir/ops/properties/StoreSuperPropertyOp";
import {
  assignmentExpression,
  expressionStatement,
  identifier,
  memberExpression,
  superExpression,
  type ESTreeStatement,
} from "../../ast";
import type { CodegenContext } from "../../CodegenContext";

export function emitStoreSuperPropertyOp(
  context: CodegenContext,
  op: StoreSuperPropertyOp,
): ESTreeStatement[] {
  const expression = assignmentExpression(
    memberExpression(
      superExpression(),
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
