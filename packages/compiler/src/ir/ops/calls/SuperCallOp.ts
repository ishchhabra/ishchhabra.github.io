import { Operation, type OperationId } from "../../core/Operation";
import type { OperationCloneContext } from "../../core/OperationCloneContext";
import type { Value } from "../../core/Value";
import { type OperationEffects, UnknownOperationEffects } from "../../effects";
import {
  argumentListElementValues,
  argumentListElementsWithValues,
  type ArgumentListElement,
} from "./ArgumentListElement";

/**
 * Calls `super(...)` inside a derived class constructor.
 *
 * `super` is an implicit constructor reference from the enclosing class, not an
 * SSA value. The result is the completion value of the `super(...)` call.
 *
 * @example
 * ```js
 * class Child extends Parent {
 *   constructor(value) {
 *     super(value);
 *   }
 * }
 * ```
 */
export class SuperCallOp extends Operation {
  constructor(
    id: OperationId,
    public readonly args: readonly ArgumentListElement[],
    result: Value,
  ) {
    super(id, [result]);
  }

  public override operands(): readonly Value[] {
    return argumentListElementValues(this.args);
  }

  public override effects(): OperationEffects {
    return UnknownOperationEffects;
  }

  public override withOperands(operands: readonly Value[]): SuperCallOp {
    const args = argumentListElementsWithValues(this.args, operands);
    return args.every((arg, index) => arg.value === this.args[index].value)
      ? this
      : new SuperCallOp(this.id, args, this.result);
  }

  public override clone(context: OperationCloneContext): SuperCallOp {
    return new SuperCallOp(
      context.ids.operationId(),
      this.args.map((arg) => ({
        kind: arg.kind,
        value: context.value(arg.value),
      })),
      context.result(this.result),
    );
  }
}
