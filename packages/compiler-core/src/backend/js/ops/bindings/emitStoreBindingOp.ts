import type { StoreBindingOp } from "../../../../ir/ops/bindings/StoreBindingOp";
import {
  assignmentExpression,
  expressionStatement,
  identifier,
  type ESTreeStatement,
} from "../../ast";
import type { CodegenContext } from "../../CodegenContext";

export function emitStoreBindingOp(context: CodegenContext, op: StoreBindingOp): ESTreeStatement[] {
  const name = context.names.declarationName(op.declarationId);
  context.values.set(op.bindingValue, identifier(name));

  return [
    expressionStatement(
      assignmentExpression(identifier(name), context.expressionForValue(op.value)),
    ),
  ];
}
