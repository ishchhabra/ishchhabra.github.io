import type { DestructureBindingOp } from "../../../../ir/ops/patterns/DestructureBindingOp";
import {
  assignmentExpression,
  expressionStatement,
  variableDeclaration,
  type ESTreeStatement,
} from "../../ast";
import type { CodegenContext } from "../../CodegenContext";
import {
  bindingPatternDeclarationIds,
  bindingPatternDeclarationKind,
  emitBindingPatternTarget,
} from "./emitDestructurePattern";

export function emitDestructureBindingOp(
  context: CodegenContext,
  op: DestructureBindingOp,
): ESTreeStatement[] {
  const target = emitBindingPatternTarget(context, op.target);
  const source = context.expressionForValue(op.source);

  if (op.mode === "store") {
    return [expressionStatement(assignmentExpression(target, source))];
  }

  const declarationIds = bindingPatternDeclarationIds(op.target);
  if (declarationIds.length === 0) {
    return [expressionStatement(assignmentExpression(target, source))];
  }

  for (const id of declarationIds) {
    context.declaredDeclarations.add(id);
  }

  return [variableDeclaration(bindingPatternDeclarationKind(context, op.target), target, source)];
}
