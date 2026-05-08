import { Operation, type OperationId } from "../../core/Operation";
import type { OperationCloneContext } from "../../core/OperationCloneContext";
import type { Value } from "../../core/Value";

/**
 * ECMAScript binary operator.
 *
 * These operators evaluate both operands and produce one result. Short-circuit
 * operators are modeled separately because they control evaluation order.
 */
export type BinaryOperator =
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "**"
  | "=="
  | "!="
  | "==="
  | "!=="
  | "<"
  | "<="
  | ">"
  | ">="
  | "<<"
  | ">>"
  | ">>>"
  | "&"
  | "|"
  | "^"
  | "in"
  | "instanceof";

/**
 * Applies a non-short-circuiting ECMAScript binary operator to two values.
 *
 * `BinaryOp` preserves source operand order. It does not encode type-specific
 * lowering decisions such as numeric specialization, string concatenation, or
 * abstract equality expansion; those belong in later lowering or optimization
 * passes.
 */
export class BinaryOp extends Operation {
  constructor(
    id: OperationId,
    public readonly operator: BinaryOperator,
    public readonly left: Value,
    public readonly right: Value,
    result: Value,
  ) {
    super(id, [result]);
  }

  override operands(): readonly Value[] {
    return [this.left, this.right];
  }

  override withOperands(operands: readonly Value[]): BinaryOp {
    if (operands.length !== 2) {
      throw new Error(`BinaryOp#${this.id} expected 2 operands, got ${operands.length}`);
    }

    const [left, right] = operands;
    if (left === this.left && right === this.right) return this;

    return new BinaryOp(this.id, this.operator, left, right, this.result);
  }

  override clone(context: OperationCloneContext): BinaryOp {
    return new BinaryOp(
      context.ids.operationId(),
      this.operator,
      context.value(this.left),
      context.value(this.right),
      context.result(this.result),
    );
  }
}
