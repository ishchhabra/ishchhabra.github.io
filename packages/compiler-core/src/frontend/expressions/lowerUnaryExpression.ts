import type { UnaryExpression } from "oxc-parser";
import type { Value } from "../../ir/core/Value";
import { UnaryOp, type UnaryOperator } from "../../ir/ops/operators/UnaryOp";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";
import { lowerExpression } from "./lowerExpression";
import { lowerDeleteExpression } from "./lowerDeleteExpression";

/**
 * Lowers a non-mutating ECMAScript unary expression.
 */
export function lowerUnaryExpression(
  builder: FunctionIRBuilder,
  expression: UnaryExpression,
): Value {
  if (expression.operator === "delete") {
    return lowerDeleteExpression(builder, expression);
  }

  const operator = unaryOperator(expression.operator);
  const argument = lowerExpression(builder, expression.argument);
  const result = builder.createValue();

  builder.emit(new UnaryOp(builder.operationId(), operator, argument, result));

  return result;
}

function unaryOperator(operator: UnaryExpression["operator"]): UnaryOperator {
  switch (operator) {
    case "-":
    case "+":
    case "!":
    case "~":
    case "typeof":
    case "void":
      return operator;

    default:
      throw new Error(`Unsupported unary operator: ${operator}`);
  }
}
