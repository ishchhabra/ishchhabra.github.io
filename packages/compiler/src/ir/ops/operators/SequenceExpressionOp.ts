import { Operation, type OperationId } from "../../core/Operation";
import type { OperationCloneContext } from "../../core/OperationCloneContext";
import type { Value } from "../../core/Value";
import { type OperationEffects, PureOperationEffects } from "../../effects";

/**
 * Materializes an ECMAScript sequence expression.
 *
 * The operands are the already-lowered child expression values in source order.
 * The result is the completion value of the final operand. The op itself is
 * pure; side effects belong to the operations that produced its operands.
 *
 * @example
 * ```js
 * const value = (first(), second(), third());
 * ```
 */
export class SequenceExpressionOp extends Operation {
  constructor(
    id: OperationId,
    public readonly expressions: readonly Value[],
    result: Value,
  ) {
    if (expressions.length === 0) {
      throw new Error("SequenceExpressionOp requires at least one expression");
    }

    super(id, [result]);
  }

  public override operands(): readonly Value[] {
    return this.expressions;
  }

  public override effects(): OperationEffects {
    return PureOperationEffects;
  }

  public override withOperands(operands: readonly Value[]): SequenceExpressionOp {
    if (operands.length !== this.expressions.length) {
      throw new Error(
        `SequenceExpressionOp#${this.id} expected ${this.expressions.length} operands, got ${operands.length}`,
      );
    }

    return new SequenceExpressionOp(this.id, operands, this.result);
  }

  public override clone(context: OperationCloneContext): SequenceExpressionOp {
    return new SequenceExpressionOp(
      context.ids.operationId(),
      this.expressions.map((expression) => context.value(expression)),
      context.value(this.result),
    );
  }
}
