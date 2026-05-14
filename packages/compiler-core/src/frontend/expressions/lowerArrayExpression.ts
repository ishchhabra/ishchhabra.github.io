import type { ArrayExpression } from "oxc-parser";

import type { Value } from "../../ir/core/Value";
import { ArrayLiteralOp, type ArrayLiteralElement } from "../../ir/ops/objects/ArrayLiteralOp";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";
import { lowerExpression } from "./lowerExpression";

/**
 * Lowers an ECMAScript array literal.
 *
 * Element expressions and spread arguments are evaluated left-to-right. Holes
 * are preserved as literal holes so codegen can re-emit sparse array syntax.
 */
export function lowerArrayExpression(
  builder: FunctionIRBuilder,
  expression: ArrayExpression,
): Value {
  const elements = expression.elements.map((element): ArrayLiteralElement => {
    if (element === null) return { kind: "hole" };

    if (element.type === "SpreadElement") {
      return {
        kind: "spread",
        value: lowerExpression(builder, element.argument),
      };
    }

    return {
      kind: "value",
      value: lowerExpression(builder, element),
    };
  });

  const result = builder.createValue();
  builder.emit(new ArrayLiteralOp(builder.operationId(), elements, result));
  return result;
}
