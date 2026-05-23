import type { Argument, CallExpression, Expression } from "oxc-parser";

import type { Value } from "../../ir/core/Value";
import type { ArgumentListElement } from "../../ir/ops/calls/ArgumentListElement";
import { CallOp, type CallTarget } from "../../ir/ops/calls/CallOp";
import { SuperCallOp } from "../../ir/ops/calls/SuperCallOp";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";
import { lowerExpression } from "./lowerExpression";
import {
  lowerMemberPropertyKey,
  lowerPrivateMemberReference,
  lowerMemberReference,
} from "./lowerMemberExpression";

/**
 * Lowers a JavaScript call expression.
 */
export function lowerCallExpression(builder: FunctionIRBuilder, expression: CallExpression): Value {
  if (expression.optional) {
    throw new Error("Optional calls require short-circuit lowering");
  }

  if (expression.callee.type === "Super") {
    const args = expression.arguments.map((argument) => lowerCallArgument(builder, argument));
    const result = builder.createValue();

    builder.emit(new SuperCallOp(builder.operationId(), args, result));
    return result;
  }

  if (expression.callee.type === "MemberExpression" && expression.callee.object.type === "Super") {
    const args = expression.arguments.map((argument) => lowerCallArgument(builder, argument));
    const result = builder.createValue();

    builder.emit(
      new CallOp(
        builder.operationId(),
        {
          kind: "super-property",
          key: lowerMemberPropertyKey(builder, expression.callee),
        },
        args,
        result,
      ),
    );
    return result;
  }

  if (
    expression.callee.type === "MemberExpression" &&
    expression.callee.property.type === "PrivateIdentifier"
  ) {
    const reference = lowerPrivateMemberReference(builder, expression.callee);
    const args = expression.arguments.map((argument) => lowerCallArgument(builder, argument));
    const result = builder.createValue();

    builder.emit(
      new CallOp(
        builder.operationId(),
        {
          kind: "private-property",
          object: reference.object,
          name: reference.name,
        },
        args,
        result,
      ),
    );
    return result;
  }

  const target = lowerCallTarget(builder, expression.callee);
  const args = expression.arguments.map((argument) => lowerCallArgument(builder, argument));
  const result = builder.createValue();

  builder.emit(new CallOp(builder.operationId(), target, args, result));
  return result;
}

export function lowerCallTarget(builder: FunctionIRBuilder, callee: Expression): CallTarget {
  if (callee.type === "MemberExpression" && callee.object.type === "Super") {
    return {
      kind: "super-property",
      key: lowerMemberPropertyKey(builder, callee),
    };
  }

  if (callee.type === "MemberExpression" && callee.property.type === "PrivateIdentifier") {
    const reference = lowerPrivateMemberReference(builder, callee);
    return {
      kind: "private-property",
      object: reference.object,
      name: reference.name,
    };
  }

  if (callee.type === "MemberExpression") {
    const reference = lowerMemberReference(builder, callee);
    return {
      kind: "property",
      object: reference.object,
      key: reference.key,
    };
  }

  return {
    kind: "value",
    callee: lowerExpression(builder, callee),
  };
}

function lowerCallArgument(builder: FunctionIRBuilder, argument: Argument): ArgumentListElement {
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
