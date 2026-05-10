import { Operation, type OperationId } from "../../core/Operation";
import type { OperationCloneContext } from "../../core/OperationCloneContext";
import type { Value } from "../../core/Value";
import { type OperationEffects, PureOperationEffects } from "../../effects";

/**
 * Reads the current ECMAScript `this` value.
 *
 * `this` is not a declaration-backed binding, so it is modeled separately from
 * `LoadBindingOp`. Arrow functions and derived constructors can refine this
 * later with function-level `this` metadata.
 *
 * @example
 * ```js
 * this.value;
 * ```
 */
export class LoadThisOp extends Operation {
  constructor(id: OperationId, result: Value) {
    super(id, [result]);
  }

  public override operands(): readonly Value[] {
    return [];
  }

  public override effects(): OperationEffects {
    return PureOperationEffects;
  }

  public override clone(context: OperationCloneContext): LoadThisOp {
    return new LoadThisOp(context.ids.operationId(), context.result(this.result));
  }
}
