import type { TaggedTemplateOp } from "../../../../ir/ops/calls/TaggedTemplateOp";
import {
  taggedTemplateExpression,
  templateElement,
  templateLiteral,
  type ESTreeStatement,
} from "../../ast";
import type { CodegenContext } from "../../CodegenContext";
import { emitExpressionResult } from "../emitExpressionResult";
import { expressionForCallTarget } from "./emitCallOp";

/**
 * Emits a JavaScript tagged template expression.
 */
export function emitTaggedTemplateOp(
  context: CodegenContext,
  op: TaggedTemplateOp,
): ESTreeStatement[] {
  const quasi = templateLiteral(
    op.quasis.map((quasi) => templateElement(quasi.raw, quasi.cooked, quasi.tail)),
    op.expressions.map((value) => context.expressionForValue(value)),
  );
  const expression = taggedTemplateExpression(expressionForCallTarget(context, op.target), quasi);

  return emitExpressionResult(context, op, expression);
}
