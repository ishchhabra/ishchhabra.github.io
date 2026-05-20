import type { FunctionIR } from "../../../ir/core/FunctionIR";
import {
  arrowFunctionExpression,
  callExpression,
  returnStatement,
  type ESTreeExpression,
  type ReturnStatementNode,
} from "../ast";
import type { CodegenContext } from "../CodegenContext";
import { emitFunctionBody, expressionWithStatements } from "./emitFunction";

export function emitDeferredExpression(
  context: CodegenContext,
  fn: FunctionIR,
  description: string,
): ESTreeExpression {
  const body = emitFunctionBody(context, fn);
  const last = body.at(-1);
  if (last?.type !== "ReturnStatement") {
    throw new Error(`${description} must emit a trailing return statement`);
  }

  const argument = (last as ReturnStatementNode).argument;
  if (argument === null) {
    throw new Error(`${description} returned no value`);
  }

  const statements = body.slice(0, -1);
  if (statements.every((statement) => statement.type === "ExpressionStatement")) {
    return expressionWithStatements(statements, argument);
  }

  return callExpression(
    arrowFunctionExpression([], [...statements, returnStatement(argument)]),
    [],
  );
}
