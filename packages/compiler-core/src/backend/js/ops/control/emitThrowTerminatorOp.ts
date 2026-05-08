import type { ThrowTerminatorOp } from "../../../../ir/ops/control/ThrowTerminatorOp";
import { throwStatement, type ESTreeStatement } from "../../ast";
import type { CodegenContext } from "../../CodegenContext";

export function emitThrowTerminatorOp(
  context: CodegenContext,
  op: ThrowTerminatorOp,
): ESTreeStatement[] {
  return [throwStatement(context.expressionForValue(op.value))];
}
