import { Operation, type OperationId } from "../../core/Operation";
import type { OperationCloneContext } from "../../core/OperationCloneContext";
import type { PrivateName } from "../../core/PrivateName";
import type { Value } from "../../core/Value";
import { type OperationEffects, UnknownOperationEffects } from "../../effects";

/**
 * Tests whether an object has a private brand.
 *
 * @example
 * ```js
 * #x in obj;
 * ```
 */
export class HasPrivateNameOp extends Operation {
  constructor(
    id: OperationId,
    public readonly name: PrivateName,
    public readonly object: Value,
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

  public override withOperands(operands: readonly Value[]): HasPrivateNameOp {
    if (operands.length !== 1) {
      throw new Error(`HasPrivateNameOp#${this.id} expected 1 operand, got ${operands.length}`);
    }

    return operands[0] === this.object
      ? this
      : new HasPrivateNameOp(this.id, this.name, operands[0], this.result);
  }

  public override clone(context: OperationCloneContext): HasPrivateNameOp {
    return new HasPrivateNameOp(
      context.ids.operationId(),
      this.name,
      context.value(this.object),
      context.result(this.result),
    );
  }
}
