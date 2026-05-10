import type { FunctionIR } from "../../core/FunctionIR";
import { Operation, type OperationId } from "../../core/Operation";
import type { OperationCloneContext } from "../../core/OperationCloneContext";
import type { PrivateName } from "../../core/PrivateName";
import type { Value } from "../../core/Value";
import { type OperationEffects, UnknownOperationEffects } from "../../effects";
import type { PropertyKey } from "../properties/PropertyKey";

export type ClassElement = ClassMethodElement | ClassFieldElement;

export type ClassElementKey =
  | { readonly kind: "public"; readonly key: PropertyKey }
  | { readonly kind: "private"; readonly name: PrivateName };

/**
 * Defines a method-like element in a class body.
 *
 * @example
 * ```js
 * class C {
 *   constructor() {}
 *   method() {}
 *   static create() {}
 *   get value() {}
 *   set value(next) {}
 * }
 * ```
 */
export interface ClassMethodElement {
  readonly kind: "method";
  readonly methodKind: "constructor" | "method" | "get" | "set";
  readonly placement: "prototype" | "static";
  readonly key: ClassElementKey;
  readonly functionIR: FunctionIR;
  readonly captures: readonly Value[];
}

/**
 * Defines a public field in a class body.
 *
 * Field initializers are stored as deferred function IR because instance field
 * expressions run for each constructed instance, not when the class value is
 * created.
 *
 * @example
 * ```js
 * class C {
 *   x = this.compute();
 *   static count = 0;
 * }
 * ```
 */
export interface ClassFieldElement {
  readonly kind: "field";
  readonly placement: "instance" | "static";
  readonly key: ClassElementKey;
  readonly initializer: FunctionIR | null;
  readonly captures: readonly Value[];
}

/**
 * Materializes an ECMAScript class value.
 *
 * Class declarations and class expressions both lower to this operation.
 * Binding initialization is modeled separately so declaration hoisting, TDZ,
 * and export handling remain outside the class-construction op.
 *
 * @example
 * ```js
 * class C extends Base {
 *   method() {}
 * }
 * ```
 */
export class CreateClassOp extends Operation {
  constructor(
    id: OperationId,
    public readonly name: string | null,
    public readonly superClass: Value | null,
    public readonly elements: readonly ClassElement[],
    result: Value,
  ) {
    super(id, [result]);
  }

  public override operands(): readonly Value[] {
    return [
      ...(this.superClass === null ? [] : [this.superClass]),
      ...this.elements.flatMap((element) => {
        switch (element.kind) {
          case "method":
            return [...classElementKeyOperands(element.key), ...element.captures];

          case "field":
            return [...classElementKeyOperands(element.key), ...element.captures];
        }
      }),
    ];
  }

  public override effects(): OperationEffects {
    return UnknownOperationEffects;
  }

  public override withOperands(operands: readonly Value[]): CreateClassOp {
    const expected = this.operands().length;
    if (operands.length !== expected) {
      throw new Error(
        `CreateClassOp#${this.id} expected ${expected} operands, got ${operands.length}`,
      );
    }

    let index = 0;
    const superClass = this.superClass === null ? null : operands[index++];

    const elements = this.elements.map((element): ClassElement => {
      switch (element.kind) {
        case "method": {
          const [key, nextIndex] = classElementKeyWithOperands(element.key, operands, index);
          index = nextIndex;
          const captures = operands.slice(index, index + element.captures.length);
          index += element.captures.length;

          return { ...element, key, captures };
        }

        case "field": {
          const [key, nextIndex] = classElementKeyWithOperands(element.key, operands, index);
          index = nextIndex;
          const captures = operands.slice(index, index + element.captures.length);
          index += element.captures.length;

          return { ...element, key, captures };
        }
      }
    });

    return new CreateClassOp(this.id, this.name, superClass, elements, this.result);
  }

  public override clone(context: OperationCloneContext): CreateClassOp {
    return new CreateClassOp(
      context.ids.operationId(),
      this.name,
      this.superClass === null ? null : context.value(this.superClass),
      this.elements.map((element): ClassElement => {
        switch (element.kind) {
          case "method":
            return {
              kind: "method",
              methodKind: element.methodKind,
              placement: element.placement,
              key: cloneClassElementKey(context, element.key),
              functionIR: element.functionIR,
              captures: element.captures.map((capture) => context.value(capture)),
            };

          case "field":
            return {
              kind: "field",
              placement: element.placement,
              key: cloneClassElementKey(context, element.key),
              initializer: element.initializer,
              captures: element.captures.map((capture) => context.value(capture)),
            };
        }
      }),
      context.result(this.result),
    );
  }
}

function classElementKeyOperands(key: ClassElementKey): readonly Value[] {
  return key.kind === "public" && key.key.kind === "computed" ? [key.key.value] : [];
}

function classElementKeyWithOperands(
  key: ClassElementKey,
  operands: readonly Value[],
  index: number,
): readonly [ClassElementKey, number] {
  if (key.kind !== "public" || key.key.kind !== "computed") {
    return [key, index];
  }

  return [{ kind: "public", key: { kind: "computed", value: operands[index] } }, index + 1];
}

function cloneClassElementKey(
  context: OperationCloneContext,
  key: ClassElementKey,
): ClassElementKey {
  return key.kind === "public" && key.key.kind === "computed"
    ? {
        kind: "public",
        key: { kind: "computed", value: context.value(key.key.value) },
      }
    : key;
}
