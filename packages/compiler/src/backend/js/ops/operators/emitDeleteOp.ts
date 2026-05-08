import type { DeleteOp, DeleteTarget } from "../../../../ir/ops/operators/DeleteOp";
import {
  identifier,
  expressionStatement,
  memberExpression,
  unaryExpression,
  type ESTreeExpression,
  type ESTreeStatement,
} from "../../ast";
import type { CodegenContext } from "../../CodegenContext";

/**
 * Caches the JavaScript expression for a delete result.
 */
export function emitDeleteOp(context: CodegenContext, op: DeleteOp): ESTreeStatement[] {
  const expression = unaryExpression("delete", deleteTargetExpression(context, op.target));

  context.values.set(op.result, expression);

  if (op.result.users.size === 0) {
    return [expressionStatement(expression)];
  }

  return [];
}

function deleteTargetExpression(context: CodegenContext, target: DeleteTarget): ESTreeExpression {
  switch (target.kind) {
    case "property":
      return memberExpression(
        context.expressionForValue(target.object),
        target.key.kind === "static"
          ? identifier(target.key.name)
          : context.expressionForValue(target.key.value),
        target.key.kind === "computed",
      );

    case "global":
    case "binding":
      return identifier(target.name);

    case "value":
      return context.expressionForValue(target.value);
  }
}
