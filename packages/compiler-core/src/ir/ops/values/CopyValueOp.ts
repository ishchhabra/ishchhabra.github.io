import { Operation, type OperationId } from "../../core/Operation";
import type { OperationCloneContext } from "../../core/OperationCloneContext";
import type { Value } from "../../core/Value";
import {
  type OperationEffects,
  valueMemoryLocation,
  writeEffects,
} from "../../effects";

/**
 * Assigns one SSA value into a materialized JavaScript local value slot.
 *
 * `CopyValueOp` is introduced after SSA-style block parameters need to be
 * lowered back to executable JavaScript. The target is not an operation result:
 * it is a writable local slot represented by a `Value`.
 *
 * @example
 * ```txt
 * // Parallel block-param edge:
 * jump join(x = leftValue)
 *
 * // After SSA elimination:
 * CopyValueOp(x, leftValue)
 * jump join()
 * ```
 */
export class CopyValueOp extends Operation {
  constructor(
    id: OperationId,
    public readonly target: Value,
    public readonly source: Value,
  ) {
    super(id);
  }

  public override operands(): readonly Value[] {
    return [this.source];
  }

  public override effects(): OperationEffects {
    return writeEffects([valueMemoryLocation(this.target.id)]);
  }

  public override withOperands(operands: readonly Value[]): CopyValueOp {
    if (operands.length !== 1) {
      throw new Error(
        `CopyValueOp#${this.id} expected 1 operand, got ${operands.length}`,
      );
    }

    const [source] = operands;
    if (source === this.source) return this;

    return new CopyValueOp(this.id, this.target, source);
  }

  public override clone(context: OperationCloneContext): CopyValueOp {
    return new CopyValueOp(
      context.ids.operationId(),
      context.value(this.target),
      context.value(this.source),
    );
  }
}
