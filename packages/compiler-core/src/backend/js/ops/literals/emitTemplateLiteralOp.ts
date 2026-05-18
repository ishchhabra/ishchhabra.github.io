import type { TemplateLiteralOp } from "../../../../ir/ops/literals/TemplateLiteralOp";
import { templateElement, templateLiteral, type ESTreeStatement } from "../../ast";
import type { CodegenContext } from "../../CodegenContext";
import { emitExpressionResult } from "../emitExpressionResult";

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
  return emitExpressionResult(context, op, expression);
}
