import { Operation, type OperationId } from "../../core/Operation";
import type { OperationCloneContext } from "../../core/OperationCloneContext";
import type { Value } from "../../core/Value";
import { type OperationEffects, UnknownOperationEffects } from "../../effects";

/**
 * Evaluates an ECMAScript dynamic import expression.
 *
 * Dynamic import is syntax, not a normal call to an `import` binding. The op
 * produces the promise returned by the host module loader.
 *
 * @example
 * ```js
 * const mod = await import("./mod.js");
 * const json = await import("./data.json", { with: { type: "json" } });
 * ```
 */
export class ImportExpressionOp extends Operation {
  constructor(
    id: OperationId,
    public readonly source: Value,
    public readonly options: Value | null,
    result: Value,
  ) {
    super(id, [result]);
  }

  public override operands(): readonly Value[] {
    return this.options === null ? [this.source] : [this.source, this.options];
  }

  public override effects(): OperationEffects {
    return UnknownOperationEffects;
  }

  public override withOperands(operands: readonly Value[]): ImportExpressionOp {
    const expected = this.options === null ? 1 : 2;
    if (operands.length !== expected) {
      throw new Error(
        `ImportExpressionOp#${this.id} expected ${expected} operands, got ${operands.length}`,
      );
    }

    const [source, options] = operands;
    return new ImportExpressionOp(
      this.id,
      source,
      this.options === null ? null : options,
      this.result,
    );
  }

  public override clone(context: OperationCloneContext): ImportExpressionOp {
    return new ImportExpressionOp(
      context.ids.operationId(),
      context.value(this.source),
      this.options === null ? null : context.value(this.options),
      context.result(this.result),
    );
  }
}
