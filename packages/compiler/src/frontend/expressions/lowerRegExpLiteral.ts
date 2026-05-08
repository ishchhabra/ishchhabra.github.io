import type { RegExpLiteral } from "oxc-parser";
import type { Value } from "../../ir/core/Value";
import { RegExpLiteralOp } from "../../ir/ops/literals/RegExpLiteralOp";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";

/**
 * Lowers a regular expression literal expression.
 */
export function lowerRegExpLiteral(builder: FunctionIRBuilder, literal: RegExpLiteral): Value {
  const result = builder.createValue();

  builder.emit(
    new RegExpLiteralOp(builder.operationId(), literal.regex.pattern, literal.regex.flags, result),
  );

  return result;
}
