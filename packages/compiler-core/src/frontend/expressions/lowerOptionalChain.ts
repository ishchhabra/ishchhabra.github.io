import type {
  Argument,
  CallExpression,
  ChainExpression,
  Expression,
  MemberExpression,
  PrivateIdentifier,
  PropertyKey as OxcPropertyKey,
} from "oxc-parser";
import type { BasicBlock } from "../../ir/core/Block";
import { blockTarget } from "../../ir/core/TerminatorOp";
import type { Value } from "../../ir/core/Value";
import type { ArgumentListElement } from "../../ir/ops/calls/ArgumentListElement";
import { CallOp, type CallTarget } from "../../ir/ops/calls/CallOp";
import { IfTerminatorOp } from "../../ir/ops/control/IfTerminatorOp";
import { JumpTerminatorOp } from "../../ir/ops/control/JumpTerminatorOp";
import { ConstantOp } from "../../ir/ops/constants/ConstantOp";
import { BinaryOp } from "../../ir/ops/operators/BinaryOp";
import { LoadPrivatePropertyOp } from "../../ir/ops/properties/LoadPrivatePropertyOp";
import { LoadPropertyOp } from "../../ir/ops/properties/LoadPropertyOp";
import type { PropertyKey } from "../../ir/ops/properties/PropertyKey";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";
import { lowerExpression } from "./lowerExpression";

/**
 * Lowers a continuous ECMAScript optional chain.
 *
 * Optional chaining short-circuits the rest of the same chain to `undefined`.
 * Parenthesized expressions break the chain because they are lowered as a
 * separate expression result.
 *
 * @example
 * ```js
 * obj?.x.y;
 * obj?.[key]?.();
 * obj.method?.(arg);
 * ```
 */
export function lowerOptionalChain(builder: FunctionIRBuilder, expression: ChainExpression): Value {
  const joinBlock = builder.createBlock();
  const result = builder.createValue();
  const undefinedValue = emitUndefined(builder);

  joinBlock.appendParam(result);

  const value = lowerChainElement(builder, expression.expression, {
    joinBlock,
    undefinedValue,
  });

  if (!builder.currentBlock.isTerminated) {
    builder.terminate(new JumpTerminatorOp(builder.operationId(), blockTarget(joinBlock, [value])));
  }

  builder.setCurrentBlock(joinBlock);
  return result;
}

interface OptionalChainContext {
  readonly joinBlock: BasicBlock;
  readonly undefinedValue: Value;
}

function lowerChainElement(
  builder: FunctionIRBuilder,
  expression: Expression,
  context: OptionalChainContext,
): Value {
  switch (expression.type) {
    case "MemberExpression":
      return lowerChainMember(builder, expression, context);

    case "CallExpression":
      return lowerChainCall(builder, expression, context);

    default:
      return lowerExpression(builder, expression);
  }
}

function lowerChainMember(
  builder: FunctionIRBuilder,
  expression: MemberExpression,
  context: OptionalChainContext,
): Value {
  const object = lowerChainElement(builder, expression.object, context);

  if (expression.optional) {
    branchIfNullish(builder, object, context);
  }

  if (expression.property.type === "PrivateIdentifier") {
    const result = builder.createValue();

    builder.emit(
      new LoadPrivatePropertyOp(
        builder.operationId(),
        object,
        builder.privateNameFor(expression.property),
        result,
      ),
    );

    return result;
  }

  const key = lowerOptionalChainPropertyKey(builder, expression);
  const result = builder.createValue();

  builder.emit(new LoadPropertyOp(builder.operationId(), object, key, result));
  return result;
}

function lowerChainCall(
  builder: FunctionIRBuilder,
  expression: CallExpression,
  context: OptionalChainContext,
): Value {
  if (expression.callee.type === "Super") {
    throw new Error("super() requires dedicated super-call lowering");
  }

  const target = lowerOptionalChainCallTarget(builder, expression, context);
  const nullishValue =
    target.kind === "property" || target.kind === "private-property"
      ? target.calleeValue
      : target.callee;

  if (expression.optional) {
    branchIfNullish(builder, nullishValue, context);
  }

  const args = expression.arguments.map((argument) =>
    lowerOptionalChainCallArgument(builder, argument),
  );
  const result = builder.createValue();

  builder.emit(new CallOp(builder.operationId(), callTarget(target), args, result));
  return result;
}

type OptionalChainCallTarget =
  | { readonly kind: "value"; readonly callee: Value }
  | {
      readonly kind: "property";
      readonly object: Value;
      readonly key: PropertyKey;
      readonly calleeValue: Value;
    }
  | {
      readonly kind: "private-property";
      readonly object: Value;
      readonly name: ReturnType<FunctionIRBuilder["privateNameFor"]>;
      readonly calleeValue: Value;
    };

function lowerOptionalChainCallTarget(
  builder: FunctionIRBuilder,
  expression: CallExpression,
  context: OptionalChainContext,
): OptionalChainCallTarget {
  if (expression.callee.type !== "MemberExpression") {
    return {
      kind: "value",
      callee: lowerChainElement(builder, expression.callee, context),
    };
  }

  const object = lowerChainElement(builder, expression.callee.object, context);

  if (expression.callee.optional) {
    branchIfNullish(builder, object, context);
  }

  if (expression.callee.property.type === "PrivateIdentifier") {
    const name = builder.privateNameFor(expression.callee.property);
    const calleeValue = builder.createValue();

    builder.emit(
      new LoadPrivatePropertyOp(
        builder.operationId(),
        object,
        name,
        calleeValue,
      ),
    );

    return {
      kind: "private-property",
      object,
      name,
      calleeValue,
    };
  }

  const key = lowerOptionalChainPropertyKey(builder, expression.callee);
  const calleeValue = builder.createValue();

  builder.emit(new LoadPropertyOp(builder.operationId(), object, key, calleeValue));

  return {
    kind: "property",
    object,
    key,
    calleeValue,
  };
}

function callTarget(target: OptionalChainCallTarget): CallTarget {
  if (target.kind === "value") {
    return { kind: "value", callee: target.callee };
  }

  if (target.kind === "private-property") {
    return {
      kind: "value-with-receiver",
      callee: target.calleeValue,
      receiver: target.object,
    };
  }

  return {
    kind: "value-with-receiver",
    callee: target.calleeValue,
    receiver: target.object,
  };
}

function branchIfNullish(
  builder: FunctionIRBuilder,
  value: Value,
  context: OptionalChainContext,
): void {
  const continuation = builder.createBlock();
  const nullValue = builder.createValue();
  const condition = builder.createValue();

  builder.emit(new ConstantOp(builder.operationId(), null, nullValue));
  builder.emit(new BinaryOp(builder.operationId(), "==", value, nullValue, condition));

  builder.terminate(
    new IfTerminatorOp(
      builder.operationId(),
      condition,
      blockTarget(context.joinBlock, [context.undefinedValue]),
      blockTarget(continuation),
      context.joinBlock,
    ),
  );

  builder.setCurrentBlock(continuation);
}

function lowerOptionalChainPropertyKey(
  builder: FunctionIRBuilder,
  expression: MemberExpression,
): PropertyKey {
  if (expression.property.type === "PrivateIdentifier") {
    throw new Error("Optional private property access requires private-name lowering");
  }

  if (expression.computed) {
    return {
      kind: "computed",
      value: lowerExpression(builder, expressionPropertyKey(expression.property)),
    };
  }

  return { kind: "static", name: staticPropertyName(expression.property) };
}

function lowerOptionalChainCallArgument(
  builder: FunctionIRBuilder,
  argument: Argument,
): ArgumentListElement {
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

function emitUndefined(builder: FunctionIRBuilder): Value {
  const value = builder.createValue();
  builder.emit(new ConstantOp(builder.operationId(), undefined, value));
  return value;
}

function expressionPropertyKey(
  key: OxcPropertyKey,
): Exclude<OxcPropertyKey, PrivateIdentifier> & Expression {
  if (key.type === "PrivateIdentifier") {
    throw new Error("Private names are not valid computed property keys");
  }

  return key;
}

function staticPropertyName(property: Exclude<OxcPropertyKey, PrivateIdentifier>): string {
  switch (property.type) {
    case "Identifier":
      return property.name;

    case "Literal":
      return String(property.value);

    default:
      throw new Error(`Unsupported optional property key: ${property.type}`);
  }
}
