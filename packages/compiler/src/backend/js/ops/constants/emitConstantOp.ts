import type { ConstantOp } from "../../../../ir/ops/constants/ConstantOp";
import { literal, type ESTreeStatement } from "../../ast";
import type { CodegenContext } from "../../CodegenContext";

/**
 * Caches the JavaScript expression for a constant operation result.
 */
export function emitConstantOp(context: CodegenContext, op: ConstantOp): ESTreeStatement[] {
  context.values.set(op.result, literal(op.value));
  return [];
}
