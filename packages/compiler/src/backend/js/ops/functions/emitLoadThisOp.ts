import type { LoadThisOp } from "../../../../ir/ops/functions/LoadThisOp";
import { thisExpression, type ESTreeStatement } from "../../ast";
import type { CodegenContext } from "../../CodegenContext";

export function emitLoadThisOp(context: CodegenContext, op: LoadThisOp): ESTreeStatement[] {
  context.values.set(op.result, thisExpression());
  return [];
}
