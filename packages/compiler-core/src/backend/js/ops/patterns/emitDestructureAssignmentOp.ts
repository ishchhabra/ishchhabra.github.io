import type { DestructureAssignmentOp } from "../../../../ir/ops/patterns/DestructureAssignmentOp";
import { assignmentExpression, expressionStatement, type ESTreeStatement } from "../../ast";
import type { CodegenContext } from "../../CodegenContext";
import { emitAssignmentPatternTarget } from "./emitDestructurePattern";

export function emitDestructureAssignmentOp(
  context: CodegenContext,
  op: DestructureAssignmentOp,
): ESTreeStatement[] {
  const source = context.expressionForValue(op.source);
  context.values.set(op.result, source);

  return [
    expressionStatement(
      assignmentExpression(emitAssignmentPatternTarget(context, op.target), source),
    ),
  ];
}
