import type { BinaryExpression, PrivateIdentifier } from "oxc-parser";

import type { Value } from "../../ir/core/Value";
import { BinaryOp, type BinaryOperator } from "../../ir/ops/operators/BinaryOp";
import { HasPrivateNameOp } from "../../ir/ops/properties/HasPrivateNameOp";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";
import { lowerExpression } from "./lowerExpression";

type BinaryExpressionLeft = BinaryExpression["left"] | PrivateIdentifier;

/**
 * Lowers a non-short-circuiting ECMAScript binary expression.
 */
export function lowerBinaryExpression(
  builder: FunctionIRBuilder,
  expression: BinaryExpression,
): Value {
  const left = expression.left as BinaryExpressionLeft;

  if (left.type === "PrivateIdentifier") {
    const object = lowerExpression(builder, expression.right);
    const result = builder.createValue();

    builder.emit(
      new HasPrivateNameOp(builder.operationId(), builder.privateNameFor(left), object, result),
    );

    return result;
  }

  const operator = binaryOperator(expression.operator);
  const leftValue = lowerExpression(builder, expression.left);
  const right = lowerExpression(builder, expression.right);
  const result = builder.createValue();

  builder.emit(new BinaryOp(builder.operationId(), operator, leftValue, right, result));

  return result;
}

function binaryOperator(operator: BinaryExpression["operator"]): BinaryOperator {
  switch (operator) {
    case "+":
    case "-":
    case "*":
    case "/":
    case "%":
    case "**":
    case "==":
    case "!=":
    case "===":
    case "!==":
    case "<":
    case "<=":
    case ">":
    case ">=":
    case "<<":
    case ">>":
    case ">>>":
    case "&":
    case "|":
    case "^":
    case "in":
    case "instanceof":
      return operator;

    default:
      throw new Error("Unsupported binary operator");
  }
}
