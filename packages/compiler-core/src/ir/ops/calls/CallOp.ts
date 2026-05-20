import { Operation, type OperationId } from "../../core/Operation";
import type { OperationCloneContext } from "../../core/OperationCloneContext";
import type { PrivateName } from "../../core/PrivateName";
import type { Value } from "../../core/Value";
import { UnknownOperationEffects, type OperationEffects } from "../../effects";
import type { PropertyKey } from "../properties/PropertyKey";
import {
  argumentListElementValues,
  argumentListElementsWithValues,
  type ArgumentListElement,
} from "./ArgumentListElement";

export type CallTarget =
  | { readonly kind: "value"; readonly callee: Value }
  | {
      readonly kind: "value-with-receiver";
      readonly callee: Value;
      readonly receiver: Value;
    }
  | {
      readonly kind: "property";
      readonly object: Value;
      readonly key: PropertyKey;
    }
  | {
      readonly kind: "private-property";
      readonly object: Value;
      readonly name: PrivateName;
    }
  | { readonly kind: "super-property"; readonly key: PropertyKey };

/**
 * Calls a JavaScript target with positional arguments.
 *
 * Value targets model calls such as `fn()`. Value-with-receiver targets model
 * calls where a method value was already loaded but must still receive a
 * JavaScript `this` value. Property targets model calls such as `obj.method()`
 * and preserve receiver semantics without materializing the method as a
 * detached value first. Super property targets model calls such as
 * `super.method()`, where `super` is supplied by the enclosing method context
 * rather than an SSA value.
 *
 * Unknown JavaScript calls are opaque effect barriers: they may read or write
 * arbitrary memory, throw, diverge, and perform observable work.
 */
export class CallOp extends Operation {
  constructor(
    id: OperationId,
    public readonly target: CallTarget,
    public readonly args: readonly ArgumentListElement[],
    result: Value,
  ) {
    super(id, [result]);
  }

  public override operands(): readonly Value[] {
    return [...callTargetOperands(this.target), ...argumentListElementValues(this.args)];
  }

  public override effects(): OperationEffects {
    return UnknownOperationEffects;
  }

  public override withOperands(operands: readonly Value[]): CallOp {
    const targetArity = callTargetOperands(this.target).length;
    if (operands.length !== targetArity + this.args.length) {
      throw new Error(
        `CallOp#${this.id} expected ${targetArity + this.args.length} operands, got ${operands.length}`,
      );
    }

    const target = callTargetWithOperands(this.target, operands.slice(0, targetArity));
    const args = argumentListElementsWithValues(this.args, operands.slice(targetArity));

    if (
      sameCallTarget(target, this.target) &&
      args.every((arg, i) => arg.value === this.args[i].value)
    ) {
      return this;
    }

    return new CallOp(this.id, target, args, this.result);
  }

  public override clone(context: OperationCloneContext): CallOp {
    return new CallOp(
      context.ids.operationId(),
      cloneCallTarget(context, this.target),
      this.args.map(
        (arg): ArgumentListElement => ({
          kind: arg.kind,
          value: context.value(arg.value),
        }),
      ),
      context.result(this.result),
    );
  }
}

export function callTargetOperands(target: CallTarget): readonly Value[] {
  if (target.kind === "value") return [target.callee];
  if (target.kind === "value-with-receiver") {
    return [target.callee, target.receiver];
  }
  if (target.kind === "super-property") {
    return target.key.kind === "computed" ? [target.key.value] : [];
  }
  if (target.kind === "private-property") return [target.object];

  return target.key.kind === "computed" ? [target.object, target.key.value] : [target.object];
}

export function callTargetWithOperands(target: CallTarget, operands: readonly Value[]): CallTarget {
  if (target.kind === "value") {
    return { kind: "value", callee: operands[0] };
  }

  if (target.kind === "value-with-receiver") {
    return {
      kind: "value-with-receiver",
      callee: operands[0],
      receiver: operands[1],
    };
  }

  if (target.kind === "super-property") {
    return target.key.kind === "computed"
      ? { kind: "super-property", key: { kind: "computed", value: operands[0] } }
      : target;
  }

  if (target.kind === "private-property") {
    return { ...target, object: operands[0] };
  }

  if (target.key.kind === "computed") {
    return {
      kind: "property",
      object: operands[0],
      key: { kind: "computed", value: operands[1] },
    };
  }

  return {
    kind: "property",
    object: operands[0],
    key: target.key,
  };
}

export function sameCallTarget(left: CallTarget, right: CallTarget): boolean {
  if (left.kind !== right.kind) return false;

  if (left.kind === "value" && right.kind === "value") {
    return left.callee === right.callee;
  }

  if (left.kind === "value-with-receiver" && right.kind === "value-with-receiver") {
    return left.callee === right.callee && left.receiver === right.receiver;
  }

  if (left.kind === "property" && right.kind === "property") {
    if (left.object !== right.object || left.key.kind !== right.key.kind) {
      return false;
    }

    return left.key.kind === "static" && right.key.kind === "static"
      ? left.key.name === right.key.name
      : left.key.kind === "computed" &&
          right.key.kind === "computed" &&
          left.key.value === right.key.value;
  }

  if (left.kind === "super-property" && right.kind === "super-property") {
    if (left.key.kind !== right.key.kind) return false;

    return left.key.kind === "static" && right.key.kind === "static"
      ? left.key.name === right.key.name
      : left.key.kind === "computed" &&
          right.key.kind === "computed" &&
          left.key.value === right.key.value;
  }

  if (left.kind === "private-property" && right.kind === "private-property") {
    return left.object === right.object && left.name.id === right.name.id;
  }

  return false;
}

export function cloneCallTarget(context: OperationCloneContext, target: CallTarget): CallTarget {
  if (target.kind === "value") {
    return { kind: "value", callee: context.value(target.callee) };
  }

  if (target.kind === "value-with-receiver") {
    return {
      kind: "value-with-receiver",
      callee: context.value(target.callee),
      receiver: context.value(target.receiver),
    };
  }

  if (target.kind === "super-property") {
    return {
      kind: "super-property",
      key:
        target.key.kind === "computed"
          ? { kind: "computed", value: context.value(target.key.value) }
          : target.key,
    };
  }

  if (target.kind === "private-property") {
    return {
      kind: "private-property",
      object: context.value(target.object),
      name: target.name,
    };
  }

  return {
    kind: "property",
    object: context.value(target.object),
    key:
      target.key.kind === "computed"
        ? { kind: "computed", value: context.value(target.key.value) }
        : target.key,
  };
}
