import { Operation, type OperationId } from "../../core/Operation";
import type { OperationCloneContext } from "../../core/OperationCloneContext";
import type { Value } from "../../core/Value";

/**
 * Non-mutating ECMAScript unary operator.
 *
 * These operators evaluate one operand and produce one result. `delete` is not
 * included because it has binding/property mutation semantics and should be
 * modeled by dedicated delete operations.
 */
export type UnaryOperator = "-" | "+" | "!" | "~" | "typeof" | "void";

/**
 * Applies a non-mutating ECMAScript unary operator to one value.
 *
 * `UnaryOp` preserves source operand evaluation and produces one result. It
 * models JavaScript-level operator semantics; type-specific lowering decisions
 * such as numeric specialization, boolean normalization, or `typeof` expansion
 * belong in later lowering or optimization passes.
 */
export class UnaryOp extends Operation {
  constructor(
    id: OperationId,
    public readonly operator: UnaryOperator,
    public readonly argument: Value,
    result: Value,
  ) {
    super(id, [result]);
  }

  public override operands(): readonly Value[] {
    return [this.argument];
  }

  public override withOperands(operands: readonly Value[]): UnaryOp {
    if (operands.length !== 1) {
      throw new Error(`UnaryOp#${this.id} expected 1 operand, got ${operands.length}`);
    }

    const [argument] = operands;
    if (argument === this.argument) return this;

    return new UnaryOp(this.id, this.operator, argument, this.result);
  }

  public override clone(context: OperationCloneContext): UnaryOp {
    return new UnaryOp(
      context.ids.operationId(),
      this.operator,
      context.value(this.argument),
      context.result(this.result),
    );
  }
}
