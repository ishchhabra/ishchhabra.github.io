import { assignmentPatternBindings } from "../../../../ir/core/DestructurePattern";
import type { DestructureAssignmentOp } from "../../../../ir/ops/patterns/DestructureAssignmentOp";
import {
  assignmentExpression,
  expressionStatement,
  identifier,
  type ESTreeStatement,
} from "../../ast";
import type { CodegenContext } from "../../CodegenContext";
import { emitAssignmentPatternTarget } from "./emitDestructurePattern";

export function emitDestructureAssignmentOp(
  context: CodegenContext,
  op: DestructureAssignmentOp,
): ESTreeStatement[] {
  const source = context.expressionForValue(op.source);
  context.values.set(op.completionValue, source);

  for (const binding of assignmentPatternBindings(op.target)) {
    context.values.set(
      binding.bindingValue,
      identifier(context.names.declarationName(binding.declarationId)),
    );
  }

  return [
    expressionStatement(
      assignmentExpression(emitAssignmentPatternTarget(context, op.target), source),
    ),
  ];
}
