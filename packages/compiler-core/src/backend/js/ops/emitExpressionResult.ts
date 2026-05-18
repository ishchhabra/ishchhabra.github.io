import type { Operation } from "../../../ir/core/Operation";
import type { Value } from "../../../ir/core/Value";
import { canDropOperationEffects } from "../../../ir/effects";
import { expressionStatement, type ESTreeExpression, type ESTreeStatement } from "../ast";
import type { CodegenContext } from "../CodegenContext";

export function emitExpressionResult(
  context: CodegenContext,
  op: Operation & { readonly result: Value },
  expression: ESTreeExpression,
): ESTreeStatement[] {
  context.values.set(op.result, expression);

  if (op.result.users.size === 0 && !canDropOperationEffects(op.effects())) {
    return [expressionStatement(expression)];
  }

  return [];
}
