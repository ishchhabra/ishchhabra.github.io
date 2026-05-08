import { Operation, OperationId } from "../../core/Operation";
import { OperationCloneContext } from "../../core/OperationCloneContext";
import { Value } from "../../core/Value";
import { OperationEffects, PureOperationEffects } from "../../effects";

export type ConstantValue = null | undefined | boolean | number | string | bigint;

/** Materializes a compile-time-known ECMAScript value.
 *
 * `ConstantOp` has no operands, produces one SSA result, and has no observable
 * effects. It represents the value itself, not the source syntax that produced it.
 */
export class ConstantOp extends Operation {
  constructor(
    id: OperationId,
    public readonly value: ConstantValue,
    result: Value,
  ) {
    super(id, [result]);
  }

  public override operands(): readonly Value[] {
    return [];
  }

  public override effects(): OperationEffects {
    return PureOperationEffects;
  }

  public override clone(context: OperationCloneContext): ConstantOp {
    return new ConstantOp(context.ids.operationId(), this.value, context.result(this.result));
  }
}
