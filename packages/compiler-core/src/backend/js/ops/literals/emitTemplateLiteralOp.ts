import type { TemplateLiteralOp } from "../../../../ir/ops/literals/TemplateLiteralOp";
import { expressionStatement, templateElement, templateLiteral, type ESTreeStatement } from "../../ast";
import type { CodegenContext } from "../../CodegenContext";

/**
 * Caches the JavaScript expression for a template literal operation result.
 */
export function emitTemplateLiteralOp(
  context: CodegenContext,
  op: TemplateLiteralOp,
): ESTreeStatement[] {
  const expression = templateLiteral(
    op.quasis.map((quasi) => templateElement(quasi.raw, quasi.cooked, quasi.tail)),
    op.expressions.map((value) => context.expressionForValue(value)),
  );
  context.values.set(op.result, expression);

  if (op.result.users.size === 0) {
    return [expressionStatement(expression)];
  }

  return [];
}
