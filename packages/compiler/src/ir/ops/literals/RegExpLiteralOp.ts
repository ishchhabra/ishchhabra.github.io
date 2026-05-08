import { Operation, type OperationId } from "../../core/Operation";
import type { OperationCloneContext } from "../../core/OperationCloneContext";
import type { Value } from "../../core/Value";
import { type OperationEffects, UnknownOperationEffects } from "../../effects";

/**
 * Materializes an ECMAScript regular expression literal.
 *
 * RegExp literals are not constants in the IR sense: evaluating the literal
 * creates a fresh `RegExp` object each time, and the resulting object has
 * mutable state such as `lastIndex`.
 *
 * @example
 * ```js
 * const pattern = /abc/g;
 * ```
 */
export class RegExpLiteralOp extends Operation {
  constructor(
    id: OperationId,
    public readonly pattern: string,
    public readonly flags: string,
    result: Value,
  ) {
    super(id, [result]);
  }

  public override operands(): readonly Value[] {
    return [];
  }

  public override effects(): OperationEffects {
    return UnknownOperationEffects;
  }

  public override clone(context: OperationCloneContext): RegExpLiteralOp {
    return new RegExpLiteralOp(
      context.ids.operationId(),
      this.pattern,
      this.flags,
      context.value(this.result),
    );
  }
}
