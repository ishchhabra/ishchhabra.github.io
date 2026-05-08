import type { ReturnTerminatorOp } from "../../../../ir/ops/control/ReturnTerminatorOp";
import { returnStatement, type ESTreeStatement } from "../../ast";
import type { CodegenContext } from "../../CodegenContext";

export function emitReturnTerminatorOp(
  context: CodegenContext,
  op: ReturnTerminatorOp,
): ESTreeStatement[] {
  return [returnStatement(op.value === null ? null : context.expressionForValue(op.value))];
}
