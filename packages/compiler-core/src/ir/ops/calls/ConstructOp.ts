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
 * Constructs a value with ECMAScript `new`.
 *
 * The constructor value and arguments are evaluated before this op. The op
 * models `[[Construct]]`, so it is distinct from `CallOp`.
 *
 * @example
 * ```js
 * const value = new Constructor(arg);
 * ```
 */
export class ConstructOp extends Operation {
  constructor(
    id: OperationId,
    public readonly constructorValue: Value,
    public readonly args: readonly ArgumentListElement[],
    result: Value,
  ) {
    super(id, [result]);
  }

  public override operands(): readonly Value[] {
    return [this.constructorValue, ...argumentListElementValues(this.args)];
  }

  public override effects(): OperationEffects {
    return UnknownOperationEffects;
  }

  public override withOperands(operands: readonly Value[]): ConstructOp {
    const expected = this.operands().length;
    if (operands.length !== expected) {
      throw new Error(
        `ConstructOp#${this.id} expected ${expected} operands, got ${operands.length}`,
      );
    }

    const [constructorValue, ...argValues] = operands;
    return new ConstructOp(
      this.id,
      constructorValue,
      argumentListElementsWithValues(this.args, argValues),
      this.result,
    );
  }

  public override clone(context: OperationCloneContext): ConstructOp {
    return new ConstructOp(
      context.ids.operationId(),
      context.value(this.constructorValue),
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
