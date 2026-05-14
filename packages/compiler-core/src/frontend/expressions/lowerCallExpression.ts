import type { Argument, CallExpression } from "oxc-parser";

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

  const target = lowerCallTarget(builder, expression);
  const args = expression.arguments.map((argument) => lowerCallArgument(builder, argument));
  const result = builder.createValue();

  builder.emit(new CallOp(builder.operationId(), target, args, result));
  return result;
}

function lowerCallTarget(builder: FunctionIRBuilder, expression: CallExpression): CallTarget {
  if (expression.callee.type === "MemberExpression") {
    const reference = lowerMemberReference(builder, expression.callee);
    return {
      kind: "property",
      object: reference.object,
      key: reference.key,
    };
  }

  return {
    kind: "value",
    callee: lowerExpression(builder, expression.callee),
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
