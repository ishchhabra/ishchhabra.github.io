import { Operation, type OperationId } from "../../core/Operation";
import type { OperationCloneContext } from "../../core/OperationCloneContext";
import type { PrivateName } from "../../core/PrivateName";
import type { Value } from "../../core/Value";
import { type OperationEffects, UnknownOperationEffects } from "../../effects";

/**
 * Reads an ECMAScript private field or method.
 *
 * Private names are lexical brands, not string property keys, so they are
 * modeled separately from normal property reads.
 */
export class LoadPrivatePropertyOp extends Operation {
  constructor(
    id: OperationId,
    public readonly object: Value,
    public readonly name: PrivateName,
    result: Value,
  ) {
    super(id, [result]);
  }

  public override operands(): readonly Value[] {
    return [this.object];
  }

  public override effects(): OperationEffects {
    return UnknownOperationEffects;
  }

  public override withOperands(operands: readonly Value[]): LoadPrivatePropertyOp {
    if (operands.length !== 1) {
      throw new Error(
        `LoadPrivatePropertyOp#${this.id} expected 1 operand, got ${operands.length}`,
      );
    }

    return operands[0] === this.object
      ? this
      : new LoadPrivatePropertyOp(this.id, operands[0], this.name, this.result);
  }

  public override clone(context: OperationCloneContext): LoadPrivatePropertyOp {
    return new LoadPrivatePropertyOp(
      context.ids.operationId(),
      context.value(this.object),
      this.name,
      context.result(this.result),
    );
  }
}
