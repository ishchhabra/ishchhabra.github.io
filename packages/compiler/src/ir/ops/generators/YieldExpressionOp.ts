import { Operation, type OperationId } from "../../core/Operation";
import type { OperationCloneContext } from "../../core/OperationCloneContext";
import type { Value } from "../../core/Value";
import { type OperationEffects, UnknownOperationEffects } from "../../effects";

/**
 * Suspends an ECMAScript generator at a `yield` expression.
 *
 * `argument` is the value yielded to the caller. The operation result is the
 * value sent back into the generator when execution resumes. For `yield*`, the
 * result is the delegated iterator's completion value.
 *
 * @example
 * ```js
 * const received = yield value;
 * const done = yield* iterable;
 * ```
 */
export class YieldExpressionOp extends Operation {
  constructor(
    id: OperationId,
    public readonly argument: Value | null,
    public readonly delegate: boolean,
    result: Value,
  ) {
    super(id, [result]);

    if (delegate && argument === null) {
      throw new Error("yield* requires an argument");
    }
  }

  public override operands(): readonly Value[] {
    return this.argument === null ? [] : [this.argument];
  }

  public override effects(): OperationEffects {
    return UnknownOperationEffects;
  }

  public override withOperands(operands: readonly Value[]): YieldExpressionOp {
    const expected = this.argument === null ? 0 : 1;
    if (operands.length !== expected) {
      throw new Error(
        `YieldExpressionOp#${this.id} expected ${expected} operands, got ${operands.length}`,
      );
    }

    const argument = this.argument === null ? null : operands[0];
    if (argument === this.argument) return this;

    return new YieldExpressionOp(this.id, argument, this.delegate, this.result);
  }

  public override clone(context: OperationCloneContext): YieldExpressionOp {
    return new YieldExpressionOp(
      context.ids.operationId(),
      this.argument === null ? null : context.value(this.argument),
      this.delegate,
      context.value(this.result),
    );
  }
}
