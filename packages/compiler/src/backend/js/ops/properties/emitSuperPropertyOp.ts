import type { SuperPropertyOp } from "../../../../ir/ops/properties/SuperPropertyOp";
import {
  expressionStatement,
  identifier,
  memberExpression,
  superExpression,
  type ESTreeStatement,
} from "../../ast";
import type { CodegenContext } from "../../CodegenContext";

export function emitSuperPropertyOp(
  context: CodegenContext,
  op: SuperPropertyOp,
): ESTreeStatement[] {
  const expression = memberExpression(
    superExpression(),
    op.key.kind === "static" ? identifier(op.key.name) : context.expressionForValue(op.key.value),
    op.key.kind === "computed",
  );

  context.values.set(op.result, expression);

  if (op.result.users.size === 0) {
    return [expressionStatement(expression)];
  }

  return [];
}
