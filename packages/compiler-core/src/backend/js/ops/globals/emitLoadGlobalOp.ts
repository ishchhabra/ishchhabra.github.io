import type { LoadGlobalOp } from "../../../../ir/ops/globals/LoadGlobalOp";
import { expressionStatement, identifier, type ESTreeStatement } from "../../ast";
import type { CodegenContext } from "../../CodegenContext";

export function emitLoadGlobalOp(context: CodegenContext, op: LoadGlobalOp): ESTreeStatement[] {
  const expression = identifier(op.name);
  context.values.set(op.result, expression);

  if (op.result.users.size === 0) {
    return [expressionStatement(expression)];
  }

  return [];
}
