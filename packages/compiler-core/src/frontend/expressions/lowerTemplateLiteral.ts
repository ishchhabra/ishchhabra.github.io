import type { TemplateLiteral } from "oxc-parser";

import type { Value } from "../../ir/core/Value";
import { TemplateLiteralOp, type TemplateElement } from "../../ir/ops/literals/TemplateLiteralOp";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";
import { lowerExpression } from "./lowerExpression";

/**
 * Lowers an untagged template literal expression.
 */
export function lowerTemplateLiteral(builder: FunctionIRBuilder, literal: TemplateLiteral): Value {
  const expressions = literal.expressions.map((expression) => lowerExpression(builder, expression));
  const quasis = literal.quasis.map(
    (quasi): TemplateElement => ({
      raw: quasi.value.raw,
      cooked: quasi.value.cooked ?? null,
      tail: quasi.tail,
    }),
  );
  const result = builder.createValue();

  builder.emit(new TemplateLiteralOp(builder.operationId(), quasis, expressions, result));

  return result;
}
