import type { CreateFunctionOp } from "../../../../ir/ops/functions/CreateFunctionOp";
import { arrowFunctionExpression, functionExpression, type ESTreeStatement } from "../../ast";
import type { CodegenContext } from "../../CodegenContext";
import {
  emitFunctionBody,
  emitFunctionName,
  emitFunctionParams,
} from "../../functions/emitFunction";

export function emitCreateFunctionOp(
  context: CodegenContext,
  op: CreateFunctionOp,
): ESTreeStatement[] {
  const params = emitFunctionParams(context, op.functionIR);
  const body = emitFunctionBody(context, op.functionIR);

  context.values.set(
    op.result,
    op.functionIR.kind === "arrow"
      ? arrowFunctionExpression(params, body, {
          async: op.functionIR.isAsync,
        })
      : functionExpression(params, body, {
          id: emitFunctionName(context, op.functionIR),
          async: op.functionIR.isAsync,
          generator: op.functionIR.isGenerator,
        }),
  );

  return [];
}
