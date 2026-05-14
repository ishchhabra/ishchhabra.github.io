import type { CopyValueOp } from "../../../../ir/ops/values/CopyValueOp";
import {
  assignmentExpression,
  expressionStatement,
  identifier,
  type ESTreeStatement,
} from "../../ast";
import type { CodegenContext } from "../../CodegenContext";

/**
 * Emits an SSA-elimination copy as an assignment to a generated local.
 */
export function emitCopyValueOp(context: CodegenContext, op: CopyValueOp): ESTreeStatement[] {
  return [
    expressionStatement(
      assignmentExpression(
        identifier(context.names.valueName(op.target)),
        context.expressionForValue(op.source),
      ),
    ),
  ];
}
