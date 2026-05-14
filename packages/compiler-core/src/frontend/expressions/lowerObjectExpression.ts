import type {
  Expression,
  Function as OxcFunction,
  ObjectExpression,
  PrivateIdentifier,
  PropertyKey as OxcPropertyKey,
} from "oxc-parser";

import type { FunctionIR } from "../../ir/core/FunctionIR";
import type { Value } from "../../ir/core/Value";
import { ObjectLiteralOp, type ObjectLiteralProperty } from "../../ir/ops/objects/ObjectLiteralOp";
import type { PropertyKey } from "../../ir/ops/properties/PropertyKey";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";
import { lowerFunctionBody } from "../functions/lowerFunctionBody";
import { lowerExpression } from "./lowerExpression";

/**
 * Lowers an ECMAScript object literal.
 *
 * Properties and spreads are evaluated in source order. For computed
 * properties, the key is evaluated before the value, matching ECMAScript object
 * literal evaluation order.
 */
export function lowerObjectExpression(
  builder: FunctionIRBuilder,
  expression: ObjectExpression,
): Value {
  const properties = expression.properties.map((property): ObjectLiteralProperty => {
    if (property.type === "SpreadElement") {
      return {
        kind: "spread",
        value: lowerExpression(builder, property.argument),
      };
    }

    const key = lowerObjectLiteralKey(builder, property.key, property.computed);

    if (property.method) {
      return {
        kind: "method",
        key,
        functionIR: lowerObjectLiteralFunction(builder, property.value),
        captures: [],
      };
    }

    if (property.kind === "get" || property.kind === "set") {
      return {
        kind: "accessor",
        accessor: property.kind,
        key,
        functionIR: lowerObjectLiteralFunction(builder, property.value),
        captures: [],
      };
    }

    if (property.kind !== "init") {
      throw new Error("Unsupported object literal property kind");
    }

    return {
      kind: "property",
      key,
      value: lowerExpression(builder, property.value),
    };
  });

  const result = builder.createValue();
  builder.emit(new ObjectLiteralOp(builder.operationId(), properties, result));
  return result;
}

function lowerObjectLiteralFunction(builder: FunctionIRBuilder, value: Expression): FunctionIR {
  if (value.type !== "FunctionExpression") {
    throw new Error(`Object literal method expected function expression, got ${value.type}`);
  }

  const functionNode = value as OxcFunction;
  const captures = builder.capturesForOwner(functionNode);
  const nested = builder.createNestedFunctionIR({
    kind: "method",
    name: functionNode.id?.name ?? null,
    isAsync: functionNode.async,
    isGenerator: functionNode.generator,
    captures,
  });

  lowerFunctionBody(nested.builder, functionNode);
  return nested.functionIR;
}

function lowerObjectLiteralKey(
  builder: FunctionIRBuilder,
  key: OxcPropertyKey,
  computed: boolean,
): PropertyKey {
  if (computed) {
    return {
      kind: "computed",
      value: lowerExpression(builder, expressionPropertyKey(key)),
    };
  }

  if (key.type === "PrivateIdentifier") {
    throw new Error("Private names are not valid object literal keys");
  }

  switch (key.type) {
    case "Identifier":
      return { kind: "static", name: key.name };

    case "Literal":
      if (
        typeof key.value !== "string" &&
        typeof key.value !== "number" &&
        typeof key.value !== "bigint"
      ) {
        throw new Error(`Unsupported object literal key: ${String(key.value)}`);
      }

      return { kind: "static", name: String(key.value) };

    default:
      throw new Error(`Unsupported object literal key: ${key.type}`);
  }
}

function expressionPropertyKey(
  key: OxcPropertyKey,
): Exclude<OxcPropertyKey, PrivateIdentifier> & Expression {
  if (key.type === "PrivateIdentifier") {
    throw new Error("Private names are not valid computed object literal keys");
  }

  return key as Exclude<OxcPropertyKey, PrivateIdentifier> & Expression;
}
