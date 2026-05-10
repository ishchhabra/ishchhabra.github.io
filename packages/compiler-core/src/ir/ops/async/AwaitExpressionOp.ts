import { Operation, type OperationId } from "../../core/Operation";
import type { OperationCloneContext } from "../../core/OperationCloneContext";
import type { Value } from "../../core/Value";
import { type OperationEffects, UnknownOperationEffects } from "../../effects";

/**
 * Awaits an ECMAScript value.
 *
 * Await may suspend the current async execution context, resume later, and
 * observe promise resolution or rejection. Later async lowering can expand this
 * op into the target runtime state-machine form.
 *
 * @example
 * ```js
 * const mod = await import("./mod.js");
 * ```
 */
export class AwaitExpressionOp extends Operation {
  constructor(
    id: OperationId,
    public readonly argument: Value,
    result: Value,
  ) {
    super(id, [result]);
  }

  public override operands(): readonly Value[] {
    return [this.argument];
  }

  public override effects(): OperationEffects {
    return UnknownOperationEffects;
  }

  public override withOperands(operands: readonly Value[]): AwaitExpressionOp {
    if (operands.length !== 1) {
      throw new Error(`AwaitExpressionOp#${this.id} expected 1 operand, got ${operands.length}`);
    }

    const [argument] = operands;
    if (argument === this.argument) return this;

    return new AwaitExpressionOp(this.id, argument, this.result);
  }

  public override clone(context: OperationCloneContext): AwaitExpressionOp {
    return new AwaitExpressionOp(
      context.ids.operationId(),
      context.value(this.argument),
      context.result(this.result),
    );
  }
}
