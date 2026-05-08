import type { LoadGlobalOp } from "../../../../ir/ops/globals/LoadGlobalOp";
import { identifier, type ESTreeStatement } from "../../ast";
import type { CodegenContext } from "../../CodegenContext";

export function emitLoadGlobalOp(context: CodegenContext, op: LoadGlobalOp): ESTreeStatement[] {
  context.values.set(op.result, identifier(op.name));
  return [];
}
