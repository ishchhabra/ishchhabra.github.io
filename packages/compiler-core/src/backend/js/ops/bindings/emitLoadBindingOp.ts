import type { LoadBindingOp } from "../../../../ir/ops/bindings/LoadBindingOp";
import { identifier, type ESTreeStatement } from "../../ast";
import type { CodegenContext } from "../../CodegenContext";
import { emitExpressionResult } from "../emitExpressionResult";

export function emitLoadBindingOp(context: CodegenContext, op: LoadBindingOp): ESTreeStatement[] {
  return emitExpressionResult(context, op, identifier(context.names.declarationName(op.declarationId)));
}
