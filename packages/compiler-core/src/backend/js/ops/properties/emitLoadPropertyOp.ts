import type { LoadPropertyOp } from "../../../../ir/ops/properties/LoadPropertyOp";
import { expressionStatement, identifier, memberExpression, type ESTreeStatement } from "../../ast";
import type { CodegenContext } from "../../CodegenContext";

export function emitLoadPropertyOp(context: CodegenContext, op: LoadPropertyOp): ESTreeStatement[] {
  const expression = memberExpression(
    context.expressionForValue(op.object),
    op.key.kind === "static" ? identifier(op.key.name) : context.expressionForValue(op.key.value),
    op.key.kind === "computed",
  );

  context.values.set(op.result, expression);

  if (op.result.users.size === 0) {
    return [expressionStatement(expression)];
  }

  return [];
}
