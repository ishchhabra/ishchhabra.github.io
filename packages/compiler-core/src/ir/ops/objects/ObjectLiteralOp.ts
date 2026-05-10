import type { FunctionIR } from "../../core/FunctionIR";
import { Operation, type OperationId } from "../../core/Operation";
import type { OperationCloneContext } from "../../core/OperationCloneContext";
import type { Value } from "../../core/Value";
import { type OperationEffects, UnknownOperationEffects } from "../../effects";
import type { PropertyKey } from "../properties/PropertyKey";

export type ObjectLiteralProperty =
  | ObjectLiteralDataProperty
  | ObjectLiteralMethodProperty
  | ObjectLiteralAccessorProperty
  | ObjectLiteralSpreadProperty;

/**
 * Defines a data property in an object literal.
 *
 * @example
 * ```js
 * ({ x: value, [key]: value });
 * ```
 */
export interface ObjectLiteralDataProperty {
  readonly kind: "property";
  readonly key: PropertyKey;
  readonly value: Value;
}

/**
 * Defines a concise method in an object literal.
 *
 * @example
 * ```js
 * ({ method() {}, async method() {}, *method() {} });
 * ```
 */
export interface ObjectLiteralMethodProperty {
  readonly kind: "method";
  readonly key: PropertyKey;
  readonly functionIR: FunctionIR;
  readonly captures: readonly Value[];
}

/**
 * Defines a getter or setter in an object literal.
 *
 * @example
 * ```js
 * ({ get x() {}, set x(value) {} });
 * ```
 */
export interface ObjectLiteralAccessorProperty {
  readonly kind: "accessor";
  readonly accessor: "get" | "set";
  readonly key: PropertyKey;
  readonly functionIR: FunctionIR;
  readonly captures: readonly Value[];
}

/**
 * Spreads enumerable own properties into an object literal.
 *
 * @example
 * ```js
 * ({ ...source });
 * ```
 */
export interface ObjectLiteralSpreadProperty {
  readonly kind: "spread";
  readonly value: Value;
}

/**
 * Materializes an ECMAScript object literal.
 *
 * This op preserves source-level object literal structure so codegen can
 * re-emit object syntax and later lowering can expand it into allocation,
 * property definition, method creation, accessor creation, and spread steps.
 */
export class ObjectLiteralOp extends Operation {
  constructor(
    id: OperationId,
    public readonly properties: readonly ObjectLiteralProperty[],
    result: Value,
  ) {
    super(id, [result]);
  }

  public override operands(): readonly Value[] {
    return this.properties.flatMap((property) => {
      switch (property.kind) {
        case "spread":
          return [property.value];

        case "property":
          return property.key.kind === "computed"
            ? [property.key.value, property.value]
            : [property.value];

        case "method":
        case "accessor":
          return property.key.kind === "computed"
            ? [property.key.value, ...property.captures]
            : property.captures;
      }
    });
  }

  public override effects(): OperationEffects {
    return UnknownOperationEffects;
  }

  public override withOperands(operands: readonly Value[]): ObjectLiteralOp {
    const expected = this.operands().length;
    if (operands.length !== expected) {
      throw new Error(
        `ObjectLiteralOp#${this.id} expected ${expected} operands, got ${operands.length}`,
      );
    }

    let index = 0;
    const properties = this.properties.map((property): ObjectLiteralProperty => {
      switch (property.kind) {
        case "spread":
          return { kind: "spread", value: operands[index++] };

        case "property":
          if (property.key.kind === "computed") {
            const key = operands[index++];
            const value = operands[index++];

            return {
              kind: "property",
              key: { kind: "computed", value: key },
              value,
            };
          }

          return {
            kind: "property",
            key: property.key,
            value: operands[index++],
          };

        case "method":
        case "accessor": {
          const key =
            property.key.kind === "computed"
              ? { kind: "computed" as const, value: operands[index++] }
              : property.key;
          const captures = operands.slice(index, index + property.captures.length);
          index += property.captures.length;

          return { ...property, key, captures };
        }
      }
    });

    return new ObjectLiteralOp(this.id, properties, this.result);
  }

  public override clone(context: OperationCloneContext): ObjectLiteralOp {
    return new ObjectLiteralOp(
      context.ids.operationId(),
      this.properties.map((property): ObjectLiteralProperty => {
        switch (property.kind) {
          case "spread":
            return {
              kind: "spread",
              value: context.value(property.value),
            };

          case "property":
            return {
              kind: "property",
              key: clonePropertyKey(context, property.key),
              value: context.value(property.value),
            };

          case "method":
            return {
              kind: "method",
              key: clonePropertyKey(context, property.key),
              functionIR: property.functionIR,
              captures: property.captures.map((capture) => context.value(capture)),
            };

          case "accessor":
            return {
              kind: "accessor",
              accessor: property.accessor,
              key: clonePropertyKey(context, property.key),
              functionIR: property.functionIR,
              captures: property.captures.map((capture) => context.value(capture)),
            };
        }
      }),
      context.result(this.result),
    );
  }
}

function clonePropertyKey(context: OperationCloneContext, key: PropertyKey): PropertyKey {
  return key.kind === "computed" ? { kind: "computed", value: context.value(key.value) } : key;
}
