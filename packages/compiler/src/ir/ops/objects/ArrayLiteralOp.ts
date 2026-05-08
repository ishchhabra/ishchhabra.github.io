import { Operation, type OperationId } from "../../core/Operation";
import type { OperationCloneContext } from "../../core/OperationCloneContext";
import type { Value } from "../../core/Value";
import { type OperationEffects, UnknownOperationEffects } from "../../effects";

export type ArrayLiteralElement =
  | {
      readonly kind: "hole";
    }
  | {
      readonly kind: "value";
      readonly value: Value;
    }
  | {
      readonly kind: "spread";
      readonly value: Value;
    };

/**
 * Materializes an ECMAScript array literal.
 *
 * This op preserves array-literal structure, including holes and spreads, so
 * codegen can re-emit array syntax and later lowering can expand it into
 * allocation, element writes, and iterator spread semantics.
 *
 * @example
 * ```js
 * const arr = [first, , ...rest, last];
 * ```
 */
export class ArrayLiteralOp extends Operation {
  constructor(
    id: OperationId,
    public readonly elements: readonly ArrayLiteralElement[],
    result: Value,
  ) {
    super(id, [result]);
  }

  public override operands(): readonly Value[] {
    return this.elements.flatMap((element) => (element.kind === "hole" ? [] : [element.value]));
  }

  public override effects(): OperationEffects {
    return UnknownOperationEffects;
  }

  public override withOperands(operands: readonly Value[]): ArrayLiteralOp {
    const expected = this.operands().length;
    if (operands.length !== expected) {
      throw new Error(
        `ArrayLiteralOp#${this.id} expected ${expected} operands, got ${operands.length}`,
      );
    }

    let index = 0;
    const elements = this.elements.map((element): ArrayLiteralElement => {
      if (element.kind === "hole") return element;

      return {
        kind: element.kind,
        value: operands[index++],
      };
    });

    return new ArrayLiteralOp(this.id, elements, this.result);
  }

  public override clone(context: OperationCloneContext): ArrayLiteralOp {
    return new ArrayLiteralOp(
      context.ids.operationId(),
      this.elements.map((element): ArrayLiteralElement => {
        if (element.kind === "hole") return element;

        return {
          kind: element.kind,
          value: context.value(element.value),
        };
      }),
      context.value(this.result),
    );
  }
}
