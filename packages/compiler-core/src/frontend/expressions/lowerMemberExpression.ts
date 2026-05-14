import { MemberExpression, PrivateIdentifier, PropertyKey } from "oxc-parser";

import type { PrivateName } from "../../ir/core/PrivateName";
import { Value } from "../../ir/core/Value";
import { LoadPrivatePropertyOp } from "../../ir/ops/properties/LoadPrivatePropertyOp";
import { LoadPropertyOp } from "../../ir/ops/properties/LoadPropertyOp";
import type { PropertyKey as IRPropertyKey } from "../../ir/ops/properties/PropertyKey";
import { SuperPropertyOp } from "../../ir/ops/properties/SuperPropertyOp";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { lowerExpression } from "./lowerExpression";

export interface LoweredMemberReference {
  readonly object: Value;
  readonly key: IRPropertyKey;
}

export interface LoweredPrivateMemberReference {
  readonly object: Value;
  readonly name: PrivateName;
}

/**
 * Lowers a property read.
 *
 * Member access evaluates the object first, then the computed key if present,
 * then reads the property. Optional member access and private fields require
 * dedicated lowering.
 */
export function lowerMemberExpression(
  builder: FunctionIRBuilder,
  expression: MemberExpression,
): Value {
  if (expression.object.type === "Super") {
    const result = builder.createValue();
    builder.emit(
      new SuperPropertyOp(
        builder.operationId(),
        lowerMemberPropertyKey(builder, expression),
        result,
      ),
    );
    return result;
  }

  if (expression.property.type === "PrivateIdentifier") {
    const reference = lowerPrivateMemberReference(builder, expression);
    const result = builder.createValue();

    builder.emit(
      new LoadPrivatePropertyOp(builder.operationId(), reference.object, reference.name, result),
    );

    return result;
  }

  const reference = lowerMemberReference(builder, expression);
  const result = builder.createValue();

  builder.emit(new LoadPropertyOp(builder.operationId(), reference.object, reference.key, result));
  return result;
}

export function lowerMemberReference(
  builder: FunctionIRBuilder,
  expression: MemberExpression,
): LoweredMemberReference {
  if (expression.optional) {
    throw new Error("Optional member access requires short-circuit lowering");
  }

  return {
    object: lowerExpression(builder, expression.object),
    key: lowerMemberPropertyKey(builder, expression),
  };
}

export function lowerPrivateMemberReference(
  builder: FunctionIRBuilder,
  expression: MemberExpression,
): LoweredPrivateMemberReference {
  if (expression.optional) {
    throw new Error("Optional private member access requires short-circuit lowering");
  }

  if (expression.property.type !== "PrivateIdentifier") {
    throw new Error("Expected private member reference");
  }

  return {
    object: lowerExpression(builder, expression.object),
    name: builder.privateNameFor(expression.property),
  };
}

export function lowerMemberPropertyKey(
  builder: FunctionIRBuilder,
  expression: MemberExpression,
): IRPropertyKey {
  if (expression.property.type === "PrivateIdentifier") {
    throw new Error("Private property access requires private-name lowering");
  }

  if (expression.computed) {
    return {
      kind: "computed",
      value: lowerExpression(builder, expression.property),
    };
  }

  return { kind: "static", name: staticPropertyName(expression.property) };
}

function staticPropertyName(property: Exclude<PropertyKey, PrivateIdentifier>): string {
  switch (property.type) {
    case "Identifier":
      return property.name;

    case "Literal":
      return String(property.value);

    default:
      throw new Error(`Unsupported property key type: ${property.type}`);
  }
}
