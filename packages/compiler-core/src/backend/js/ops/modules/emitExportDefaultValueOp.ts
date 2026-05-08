import type { ExportDefaultValueOp } from "../../../../ir/ops/modules/ExportDefaultValueOp";
import { exportDefaultDeclaration, type ESTreeStatement } from "../../ast";
import type { CodegenContext } from "../../CodegenContext";

export function emitExportDefaultValueOp(
  context: CodegenContext,
  op: ExportDefaultValueOp,
): ESTreeStatement[] {
  return [exportDefaultDeclaration(context.expressionForValue(op.value))];
}
