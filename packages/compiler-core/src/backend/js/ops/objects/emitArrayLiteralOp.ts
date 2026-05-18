import type { ArrayLiteralOp } from "../../../../ir/ops/objects/ArrayLiteralOp";
import { arrayExpression, expressionStatement, spreadElement, type ESTreeStatement } from "../../ast";
import type { CodegenContext } from "../../CodegenContext";

export function emitArrayLiteralOp(context: CodegenContext, op: ArrayLiteralOp): ESTreeStatement[] {
  const expression = arrayExpression(
    op.elements.map((element) => {
      if (element.kind === "hole") return null;

      const value = context.expressionForValue(element.value);
      return element.kind === "spread" ? spreadElement(value) : value;
    }),
  );
  context.values.set(op.result, expression);

  if (op.result.users.size === 0) {
    return [expressionStatement(expression)];
  }

  return [];
}
