import { Operation, type OperationId } from "../../core/Operation";
import type { OperationCloneContext } from "../../core/OperationCloneContext";
import type { PrivateName } from "../../core/PrivateName";
import type { Value } from "../../core/Value";
import { type OperationEffects, UnknownOperationEffects } from "../../effects";

/**
 * Writes an ECMAScript private field.
 *
 * The operation produces the assignment completion value when the surrounding
 * expression consumes it.
 */
export class StorePrivatePropertyOp extends Operation {
  constructor(
    id: OperationId,
    public readonly object: Value,
    public readonly name: PrivateName,
    public readonly value: Value,
    result?: Value,
  ) {
    super(id, result === undefined ? [] : [result]);
  }

  public override operands(): readonly Value[] {
    return [this.object, this.value];
  }

  public override effects(): OperationEffects {
    return UnknownOperationEffects;
  }

  public override withOperands(operands: readonly Value[]): StorePrivatePropertyOp {
    if (operands.length !== 2) {
      throw new Error(
        `StorePrivatePropertyOp#${this.id} expected 2 operands, got ${operands.length}`,
      );
    }

    return operands[0] === this.object && operands[1] === this.value
      ? this
      : new StorePrivatePropertyOp(this.id, operands[0], this.name, operands[1], this.results[0]);
  }

  public override clone(context: OperationCloneContext): StorePrivatePropertyOp {
    return new StorePrivatePropertyOp(
      context.ids.operationId(),
      context.value(this.object),
      this.name,
      context.value(this.value),
      this.results[0] === undefined ? undefined : context.result(this.results[0]),
    );
  }
}
