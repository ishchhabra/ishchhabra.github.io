import { Operation, type OperationId } from "../../core/Operation";
import type { OperationCloneContext } from "../../core/OperationCloneContext";
import type { Value } from "../../core/Value";
import { type OperationEffects, UnknownOperationEffects } from "../../effects";

/**
 * Executes an ECMAScript `debugger` statement.
 *
 * The statement has no operands and produces no values, but it is observable:
 * when a debugger is attached, execution may pause at this point.
 *
 * @example
 * ```js
 * debugger;
 * ```
 */
export class DebuggerOp extends Operation {
  constructor(id: OperationId) {
    super(id);
  }

  public override operands(): readonly Value[] {
    return [];
  }

  public override effects(): OperationEffects {
    return UnknownOperationEffects;
  }

  public override clone(context: OperationCloneContext): DebuggerOp {
    return new DebuggerOp(context.ids.operationId());
  }
}
