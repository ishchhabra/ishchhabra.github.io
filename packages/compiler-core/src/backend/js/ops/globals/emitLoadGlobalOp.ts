import type { LoadGlobalOp } from "../../../../ir/ops/globals/LoadGlobalOp";
import { identifier, type ESTreeStatement } from "../../ast";
import type { CodegenContext } from "../../CodegenContext";
import { emitExpressionResult } from "../emitExpressionResult";

export function emitLoadGlobalOp(context: CodegenContext, op: LoadGlobalOp): ESTreeStatement[] {
  return emitExpressionResult(context, op, identifier(op.name));
}
