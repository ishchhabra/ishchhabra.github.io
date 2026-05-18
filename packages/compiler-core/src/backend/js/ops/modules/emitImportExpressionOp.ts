import type { ImportExpressionOp } from "../../../../ir/ops/modules/ImportExpressionOp";
import { importExpression, type ESTreeStatement } from "../../ast";
import type { CodegenContext } from "../../CodegenContext";
import { emitExpressionResult } from "../emitExpressionResult";

/**
 * Caches the JavaScript expression for a dynamic import result.
 */
export function emitImportExpressionOp(
  context: CodegenContext,
  op: ImportExpressionOp,
): ESTreeStatement[] {
  return emitExpressionResult(
    context,
    op,
    importExpression(
      context.expressionForValue(op.source),
      op.options === null ? null : context.expressionForValue(op.options),
    ),
  );
}
