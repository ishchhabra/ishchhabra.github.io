import { Operation, type OperationId } from "../../core/Operation";
import type { OperationCloneContext } from "../../core/OperationCloneContext";
import type { Value } from "../../core/Value";
import {
  type OperationEffects,
  PureOperationEffects,
  UnknownOperationEffects,
} from "../../effects";

export interface TemplateElement {
  readonly raw: string;
  readonly cooked: string | null;
  readonly tail: boolean;
}

/**
 * Materializes an ECMAScript template literal.
 *
 * Template expression holes are operands. The op preserves quasi text so
 * codegen can re-emit template syntax instead of lowering immediately to
 * string concatenation and `ToString` calls.
 *
 * @example
 * ```js
 * const message = `hello ${name}`;
 * ```
 */
export class TemplateLiteralOp extends Operation {
  constructor(
    id: OperationId,
    public readonly quasis: readonly TemplateElement[],
    public readonly expressions: readonly Value[],
    result: Value,
  ) {
    super(id, [result]);
  }

  public override operands(): readonly Value[] {
    return this.expressions;
  }

  public override effects(): OperationEffects {
    return this.expressions.length === 0 ? PureOperationEffects : UnknownOperationEffects;
  }

  public override withOperands(operands: readonly Value[]): TemplateLiteralOp {
    if (operands.length !== this.expressions.length) {
      throw new Error(
        `TemplateLiteralOp#${this.id} expected ${this.expressions.length} operands, got ${operands.length}`,
      );
    }

    return new TemplateLiteralOp(this.id, this.quasis, operands, this.result);
  }

  public override clone(context: OperationCloneContext): TemplateLiteralOp {
    return new TemplateLiteralOp(
      context.ids.operationId(),
      this.quasis,
      this.expressions.map((value) => context.value(value)),
      context.value(this.result),
    );
  }
}
