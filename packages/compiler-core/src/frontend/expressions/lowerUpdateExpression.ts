import type {
  IdentifierReference,
  MemberExpression,
  UpdateExpression,
} from "oxc-parser";
import type { Value } from "../../ir/core/Value";
import { StoreBindingOp } from "../../ir/ops/bindings/StoreBindingOp";
import { ConstantOp } from "../../ir/ops/constants/ConstantOp";
import { BinaryOp, type BinaryOperator } from "../../ir/ops/operators/BinaryOp";
import { LoadPrivatePropertyOp } from "../../ir/ops/properties/LoadPrivatePropertyOp";
import { LoadPropertyOp } from "../../ir/ops/properties/LoadPropertyOp";
import { StorePrivatePropertyOp } from "../../ir/ops/properties/StorePrivatePropertyOp";
import { StorePropertyOp } from "../../ir/ops/properties/StorePropertyOp";
import { SuperPropertyOp } from "../../ir/ops/properties/SuperPropertyOp";
import { StoreSuperPropertyOp } from "../../ir/ops/properties/StoreSuperPropertyOp";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";
import { lowerIdentifier } from "./lowerIdentifier";
import {
  lowerMemberPropertyKey,
  lowerPrivateMemberReference,
  lowerMemberReference,
} from "./lowerMemberExpression";

/**
 * Lowers an ECMAScript update expression to explicit read, arithmetic, and
 * store operations.
 *
 * The returned value follows prefix/postfix semantics: prefix returns the new
 * value, postfix returns the old value.
 *
 * @example
 * ```js
 * x++;
 * ++object.count;
 * ```
 */
export function lowerUpdateExpression(
  builder: FunctionIRBuilder,
  expression: UpdateExpression,
): Value {
  if (expression.argument.type === "Identifier") {
    return lowerIdentifierUpdate(builder, expression, expression.argument);
  }

  if (expression.argument.type === "MemberExpression") {
    return lowerMemberUpdate(builder, expression, expression.argument);
  }

  throw new Error(`Unsupported update target: ${expression.argument.type}`);
}

function lowerIdentifierUpdate(
  builder: FunctionIRBuilder,
  expression: UpdateExpression,
  target: IdentifierReference,
): Value {
  const declaration = builder.declarationForReference(target);
  const oldValue = lowerIdentifier(builder, target);
  const newValue = emitUpdatedValue(builder, expression.operator, oldValue);

  builder.emit(
    new StoreBindingOp(
      builder.operationId(),
      declaration.id,
      newValue,
      builder.createValue(declaration.id),
    ),
  );

  return expression.prefix ? newValue : oldValue;
}

function lowerMemberUpdate(
  builder: FunctionIRBuilder,
  expression: UpdateExpression,
  target: MemberExpression,
): Value {
  if (target.property.type === "PrivateIdentifier") {
    return lowerPrivatePropertyUpdate(builder, expression, target);
  }

  if (target.object.type === "Super") {
    return lowerSuperPropertyUpdate(builder, expression, target);
  }

  const reference = lowerMemberReference(builder, target);
  const oldValue = builder.createValue();

  builder.emit(
    new LoadPropertyOp(
      builder.operationId(),
      reference.object,
      reference.key,
      oldValue,
    ),
  );

  const newValue = emitUpdatedValue(builder, expression.operator, oldValue);

  builder.emit(
    new StorePropertyOp(
      builder.operationId(),
      reference.object,
      reference.key,
      newValue,
    ),
  );

  return expression.prefix ? newValue : oldValue;
}

function lowerPrivatePropertyUpdate(
  builder: FunctionIRBuilder,
  expression: UpdateExpression,
  target: MemberExpression,
): Value {
  const reference = lowerPrivateMemberReference(builder, target);
  const oldValue = builder.createValue();

  builder.emit(
    new LoadPrivatePropertyOp(
      builder.operationId(),
      reference.object,
      reference.name,
      oldValue,
    ),
  );

  const newValue = emitUpdatedValue(builder, expression.operator, oldValue);

  builder.emit(
    new StorePrivatePropertyOp(
      builder.operationId(),
      reference.object,
      reference.name,
      newValue,
    ),
  );

  return expression.prefix ? newValue : oldValue;
}

function lowerSuperPropertyUpdate(
  builder: FunctionIRBuilder,
  expression: UpdateExpression,
  target: MemberExpression,
): Value {
  const key = lowerMemberPropertyKey(builder, target);
  const oldValue = builder.createValue();

  builder.emit(new SuperPropertyOp(builder.operationId(), key, oldValue));

  const newValue = emitUpdatedValue(builder, expression.operator, oldValue);

  builder.emit(new StoreSuperPropertyOp(builder.operationId(), key, newValue));

  return expression.prefix ? newValue : oldValue;
}

function emitUpdatedValue(
  builder: FunctionIRBuilder,
  operator: UpdateExpression["operator"],
  oldValue: Value,
): Value {
  const one = builder.createValue();
  builder.emit(new ConstantOp(builder.operationId(), 1, one));

  const result = builder.createValue();
  builder.emit(
    new BinaryOp(
      builder.operationId(),
      binaryOperatorForUpdate(operator),
      oldValue,
      one,
      result,
    ),
  );

  return result;
}

function binaryOperatorForUpdate(
  operator: UpdateExpression["operator"],
): BinaryOperator {
  switch (operator) {
    case "++":
      return "+";
    case "--":
      return "-";
  }
}
