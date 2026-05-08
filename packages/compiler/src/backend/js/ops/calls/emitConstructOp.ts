import type { ArgumentListElement } from "../../../../ir/ops/calls/ArgumentListElement";
import type { ConstructOp } from "../../../../ir/ops/calls/ConstructOp";
import {
  expressionStatement,
  newExpression,
  spreadElement,
  type ESTreeExpression,
  type ESTreeStatement,
  type SpreadElementNode,
} from "../../ast";
import type { CodegenContext } from "../../CodegenContext";

export function emitConstructOp(context: CodegenContext, op: ConstructOp): ESTreeStatement[] {
  const expression = newExpression(
    context.expressionForValue(op.constructorValue),
    op.args.map((arg) => emitCallArgument(context, arg)),
  );

  context.values.set(op.result, expression);

  if (op.result.users.size === 0) {
    return [expressionStatement(expression)];
  }

  return [];
}

function emitCallArgument(
  context: CodegenContext,
  argument: ArgumentListElement,
): ESTreeExpression | SpreadElementNode {
  const value = context.expressionForValue(argument.value);
  return argument.kind === "spread" ? spreadElement(value) : value;
}
