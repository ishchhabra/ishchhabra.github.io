import type { Value } from "../../ir/core/Value";
import { ConstantOp, type ConstantValue } from "../../ir/ops/constants/ConstantOp";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";
import type { LiteralNode } from "../ast/types";

/**
 * Lowers an ECMAScript literal expression.
 */
export function lowerLiteral(builder: FunctionIRBuilder, literal: LiteralNode): Value {
  const value = constantValue(literal);
  const result = builder.createValue();

  builder.emit(new ConstantOp(builder.operationId(), value, result));

  return result;
}

function constantValue(literal: LiteralNode): ConstantValue {
  if (literal.value instanceof RegExp) {
    throw new Error("RegExp literals must be lowered by lowerRegExpLiteral");
  }

  return literal.value;
}
