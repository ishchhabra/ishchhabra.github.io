import type { ArrayLiteralOp } from "../../../../ir/ops/objects/ArrayLiteralOp";
import { arrayExpression, spreadElement, type ESTreeStatement } from "../../ast";
import type { CodegenContext } from "../../CodegenContext";
import { emitExpressionResult } from "../emitExpressionResult";

export function emitArrayLiteralOp(context: CodegenContext, op: ArrayLiteralOp): ESTreeStatement[] {
  const expression = arrayExpression(
    op.elements.map((element) => {
      if (element.kind === "hole") return null;

      const value = context.expressionForValue(element.value);
      return element.kind === "spread" ? spreadElement(value) : value;
    }),
  );
  return emitExpressionResult(context, op, expression);
}
