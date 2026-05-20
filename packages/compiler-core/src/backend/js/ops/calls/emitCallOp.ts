import type { ArgumentListElement } from "../../../../ir/ops/calls/ArgumentListElement";
import type { CallOp, CallTarget } from "../../../../ir/ops/calls/CallOp";
import {
  callExpression,
  expressionStatement,
  identifier,
  memberExpression,
  privateIdentifier,
  spreadElement,
  superExpression,
  type ESTreeExpression,
  type ESTreeStatement,
  type SpreadElementNode,
} from "../../ast";
import type { CodegenContext } from "../../CodegenContext";

/**
 * Emits a JavaScript call expression.
 *
 * The call expression is cached as the result value. If the call result has no
 * SSA users, the call is emitted as a standalone expression statement because
 * calls are observable effect barriers unless proven otherwise.
 */
export function emitCallOp(context: CodegenContext, op: CallOp): ESTreeStatement[] {
  if (op.target.kind === "value-with-receiver") {
    const expression = callExpression(
      memberExpression(context.expressionForValue(op.target.callee), identifier("call"), false),
      [
        context.expressionForValue(op.target.receiver),
        ...op.args.map((arg) => emitCallArgument(context, arg)),
      ],
    );

    context.values.set(op.result, expression);

    if (op.result.users.size === 0) {
      return [expressionStatement(expression)];
    }

    return [];
  }

  const expression = callExpression(
    expressionForCallTarget(context, op.target),
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

export function expressionForCallTarget(
  context: CodegenContext,
  target: CallTarget,
): ESTreeExpression {
  if (target.kind === "value") {
    return context.expressionForValue(target.callee);
  }

  if (target.kind === "value-with-receiver") {
    return memberExpression(context.expressionForValue(target.callee), identifier("call"), false);
  }

  if (target.kind === "super-property") {
    return memberExpression(
      superExpression(),
      target.key.kind === "static"
        ? identifier(target.key.name)
        : context.expressionForValue(target.key.value),
      target.key.kind === "computed",
    );
  }

  if (target.kind === "private-property") {
    return memberExpression(
      context.expressionForValue(target.object),
      privateIdentifier(target.name.name),
      false,
    );
  }

  return memberExpression(
    context.expressionForValue(target.object),
    target.key.kind === "static"
      ? identifier(target.key.name)
      : context.expressionForValue(target.key.value),
    target.key.kind === "computed",
  );
}
