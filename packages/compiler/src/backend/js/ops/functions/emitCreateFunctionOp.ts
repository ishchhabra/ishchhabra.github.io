import type { CreateFunctionOp } from "../../../../ir/ops/functions/CreateFunctionOp";
import {
  arrowFunctionExpression,
  functionExpression,
  identifier,
  type ESTreeStatement,
} from "../../ast";
import type { CodegenContext } from "../../CodegenContext";
import { emitFunctionBody, emitFunctionParams } from "../../functions/emitFunction";

export function emitCreateFunctionOp(
  context: CodegenContext,
  op: CreateFunctionOp,
): ESTreeStatement[] {
  const body = emitFunctionBody(context, op.functionIR);
  const params = emitFunctionParams(context, op.functionIR);

  context.values.set(
    op.result,
    op.functionIR.kind === "arrow"
      ? arrowFunctionExpression(params, body, {
          async: op.functionIR.isAsync,
        })
      : functionExpression(params, body, {
          id: op.functionIR.name === null ? null : identifier(op.functionIR.name),
          async: op.functionIR.isAsync,
          generator: op.functionIR.isGenerator,
        }),
  );

  return [];
}
