import { Operation, type OperationId } from "../../core/Operation";
import type { OperationCloneContext } from "../../core/OperationCloneContext";
import type { DeclarationId, Value } from "../../core/Value";
import { type OperationEffects, UnknownOperationEffects } from "../../effects";
import type { PropertyKey } from "../properties/PropertyKey";

/**
 * Reference form targeted by an ECMAScript `delete` expression.
 *
 * `delete` operates on references, not just values. For example, `delete obj.x`
 * deletes property `x`; it does not load `obj.x` and delete the loaded value.
 */
export type DeleteTarget =
  | {
      /**
       * Deletes an object property.
       *
       * @example
       * ```js
       * delete obj.x;
       * delete obj[key];
       * ```
       */
      readonly kind: "property";
      readonly object: Value;
      readonly key: PropertyKey;
    }
  | {
      /**
       * Deletes a host or global reference by name.
       *
       * @example
       * ```js
       * delete maybeGlobal;
       * ```
       */
      readonly kind: "global";
      readonly name: string;
    }
  | {
      /**
       * Attempts to delete a declaration-backed binding.
       *
       * This stays separate from global references because lexical, parameter,
       * import, and local function bindings have different delete semantics
       * from global object properties.
       *
       * @example
       * ```js
       * let x;
       * delete x;
       * ```
       */
      readonly kind: "binding";
      readonly declarationId: DeclarationId;
      readonly name: string;
    }
  | {
      /**
       * Evaluates a non-reference operand and yields `true`.
       *
       * The operand still executes for effects, but there is no reference to
       * delete.
       *
       * @example
       * ```js
       * delete (compute());
       * delete (1);
       * ```
       */
      readonly kind: "value";
      readonly value: Value;
    };

/**
 * Evaluates an ECMAScript `delete` expression.
 *
 * Property targets preserve reference semantics: `delete obj.x` deletes the
 * property without first loading `obj.x`. Value targets model forms such as
 * `delete (call())`, where the operand is evaluated and the result is `true`.
 *
 * @example
 * ```js
 * delete obj.x;
 * delete obj[key];
 * delete maybeGlobal;
 * ```
 */
export class DeleteOp extends Operation {
  constructor(
    id: OperationId,
    public readonly target: DeleteTarget,
    result: Value,
  ) {
    super(id, [result]);
  }

  public override operands(): readonly Value[] {
    switch (this.target.kind) {
      case "property":
        return this.target.key.kind === "computed"
          ? [this.target.object, this.target.key.value]
          : [this.target.object];

      case "value":
        return [this.target.value];

      case "global":
      case "binding":
        return [];
    }
  }

  public override effects(): OperationEffects {
    return UnknownOperationEffects;
  }

  public override withOperands(operands: readonly Value[]): DeleteOp {
    return new DeleteOp(this.id, deleteTargetWithOperands(this.target, operands), this.result);
  }

  public override clone(context: OperationCloneContext): DeleteOp {
    return new DeleteOp(
      context.ids.operationId(),
      cloneDeleteTarget(context, this.target),
      context.result(this.result),
    );
  }
}

function deleteTargetWithOperands(target: DeleteTarget, operands: readonly Value[]): DeleteTarget {
  switch (target.kind) {
    case "property":
      if (target.key.kind === "computed") {
        if (operands.length !== 2) {
          throw new Error(`Computed delete target expected 2 operands, got ${operands.length}`);
        }
        return {
          kind: "property",
          object: operands[0],
          key: { kind: "computed", value: operands[1] },
        };
      }

      if (operands.length !== 1) {
        throw new Error(`Static delete target expected 1 operand, got ${operands.length}`);
      }
      return { ...target, object: operands[0] };

    case "value":
      if (operands.length !== 1) {
        throw new Error(`Value delete target expected 1 operand, got ${operands.length}`);
      }
      return { kind: "value", value: operands[0] };

    case "global":
    case "binding":
      if (operands.length !== 0) {
        throw new Error(`${target.kind} delete target expected 0 operands, got ${operands.length}`);
      }
      return target;
  }
}

function cloneDeleteTarget(context: OperationCloneContext, target: DeleteTarget): DeleteTarget {
  switch (target.kind) {
    case "property":
      return {
        kind: "property",
        object: context.value(target.object),
        key:
          target.key.kind === "computed"
            ? { kind: "computed", value: context.value(target.key.value) }
            : target.key,
      };

    case "value":
      return { kind: "value", value: context.value(target.value) };

    case "global":
    case "binding":
      return target;
  }
}
