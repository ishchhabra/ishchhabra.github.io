import type { ArrowFunctionExpression, Function as OxcFunction } from "oxc-parser";
import type { Value } from "../../ir/core/Value";
import { CreateFunctionOp } from "../../ir/ops/functions/CreateFunctionOp";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";
import { lowerArrowFunctionBody, lowerFunctionBody } from "../functions/lowerFunctionBody";

/**
 * Lowers a function expression to a runtime function object.
 */
export function lowerFunctionExpression(
  builder: FunctionIRBuilder,
  expression: OxcFunction,
): Value {
  const captures = builder.capturesForOwner(expression);
  const nested = builder.createNestedFunctionIR({
    kind: "function",
    name: expression.id?.name ?? null,
    isAsync: expression.async,
    isGenerator: expression.generator,
    captures,
  });
  const result = builder.createValue();

  lowerFunctionBody(nested.builder, expression);
  builder.emit(
    new CreateFunctionOp(builder.operationId(), nested.functionIR, result),
  );

  return result;
}

/**
 * Lowers an arrow function expression to a runtime function object.
 */
export function lowerArrowFunctionExpression(
  builder: FunctionIRBuilder,
  expression: ArrowFunctionExpression,
): Value {
  const captures = builder.capturesForOwner(expression);
  const nested = builder.createNestedFunctionIR({
    kind: "arrow",
    isAsync: expression.async,
    isGenerator: false,
    captures,
  });
  const result = builder.createValue();

  lowerArrowFunctionBody(nested.builder, expression);
  builder.emit(
    new CreateFunctionOp(builder.operationId(), nested.functionIR, result),
  );

  return result;
}
