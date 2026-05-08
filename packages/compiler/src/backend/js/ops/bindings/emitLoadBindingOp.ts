import type { LoadBindingOp } from "../../../../ir/ops/bindings/LoadBindingOp";
import { identifier, type ESTreeStatement } from "../../ast";
import type { CodegenContext } from "../../CodegenContext";

export function emitLoadBindingOp(context: CodegenContext, op: LoadBindingOp): ESTreeStatement[] {
  context.values.set(op.result, identifier(context.names.declarationName(op.declarationId)));

  return [];
}
