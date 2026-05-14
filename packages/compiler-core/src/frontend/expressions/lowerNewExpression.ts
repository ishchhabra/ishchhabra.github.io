import type { Argument, NewExpression } from "oxc-parser";

import type { Value } from "../../ir/core/Value";
import type { ArgumentListElement } from "../../ir/ops/calls/ArgumentListElement";
import { ConstructOp } from "../../ir/ops/calls/ConstructOp";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";
import { lowerExpression } from "./lowerExpression";

/**
 * Lowers an ECMAScript `new` expression.
 *
 * The callee is evaluated as a constructor value, then arguments are evaluated
 * left-to-right, then `ConstructOp` performs `[[Construct]]`.
 *
 * @example
 * ```js
 * new Constructor(arg);
 * ```
 */
export function lowerNewExpression(builder: FunctionIRBuilder, expression: NewExpression): Value {
  if (expression.callee.type === "Super") {
    throw new Error("super() requires dedicated derived-constructor lowering");
  }

  const constructorValue = lowerExpression(builder, expression.callee);
  const args = expression.arguments.map((arg) => lowerNewArgument(builder, arg));
  const result = builder.createValue();

  builder.emit(new ConstructOp(builder.operationId(), constructorValue, args, result));

  return result;
}

function lowerNewArgument(builder: FunctionIRBuilder, argument: Argument): ArgumentListElement {
  if (argument.type === "SpreadElement") {
    return {
      kind: "spread",
      value: lowerExpression(builder, argument.argument),
    };
  }

  return {
    kind: "value",
    value: lowerExpression(builder, argument),
  };
}
