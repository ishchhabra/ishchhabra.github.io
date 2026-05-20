import type { TaggedTemplateExpression } from "oxc-parser";

import type { Value } from "../../ir/core/Value";
import { TaggedTemplateOp } from "../../ir/ops/calls/TaggedTemplateOp";
import type { TemplateElement } from "../../ir/ops/literals/TemplateLiteralOp";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";
import { lowerCallTarget } from "./lowerCallExpression";
import { lowerExpression } from "./lowerExpression";

/**
 * Lowers a tagged template expression while preserving tag receiver semantics.
 */
export function lowerTaggedTemplateExpression(
  builder: FunctionIRBuilder,
  expression: TaggedTemplateExpression,
): Value {
  const target = lowerCallTarget(builder, expression.tag);
  const expressions = expression.quasi.expressions.map((child) => lowerExpression(builder, child));
  const quasis = expression.quasi.quasis.map(
    (quasi): TemplateElement => ({
      raw: quasi.value.raw,
      cooked: quasi.value.cooked ?? null,
      tail: quasi.tail,
    }),
  );
  const result = builder.createValue();

  builder.emit(new TaggedTemplateOp(builder.operationId(), target, quasis, expressions, result));

  return result;
}
