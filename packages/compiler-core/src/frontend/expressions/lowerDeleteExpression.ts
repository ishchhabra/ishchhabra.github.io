import type { IdentifierReference, UnaryExpression } from "oxc-parser";

import type { Value } from "../../ir/core/Value";
import { DeleteOp, type DeleteTarget } from "../../ir/ops/operators/DeleteOp";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";
import { lowerExpression } from "./lowerExpression";
import { lowerMemberReference } from "./lowerMemberExpression";

/**
 * Lowers an ECMAScript `delete` expression.
 */
export function lowerDeleteExpression(
  builder: FunctionIRBuilder,
  expression: UnaryExpression,
): Value {
  const target = lowerDeleteTarget(builder, expression.argument);
  const result = builder.createValue();

  builder.emit(new DeleteOp(builder.operationId(), target, result));

  return result;
}

function lowerDeleteTarget(
  builder: FunctionIRBuilder,
  argument: UnaryExpression["argument"],
): DeleteTarget {
  if (argument.type === "MemberExpression") {
    const reference = lowerMemberReference(builder, argument);
    return {
      kind: "property",
      object: reference.object,
      key: reference.key,
    };
  }

  if (argument.type === "Identifier") {
    return lowerIdentifierDeleteTarget(builder, argument);
  }

  return {
    kind: "value",
    value: lowerExpression(builder, argument),
  };
}

function lowerIdentifierDeleteTarget(
  builder: FunctionIRBuilder,
  identifier: IdentifierReference,
): DeleteTarget {
  if (builder.isGlobalReference(identifier)) {
    return { kind: "global", name: identifier.name };
  }

  const declaration = builder.declarationForReference(identifier);
  return {
    kind: "binding",
    declarationId: declaration.id,
    name: identifier.name,
  };
}
