import { OperationId, Value } from "../../core";
import type { CloneContext } from "../../core/Operation";
import { Operation } from "../../core/Operation";

export type BinaryOperator =
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
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "**"
  | "|"
  | "^"
  | "&"
  | "in"
  | "instanceof";

/**
 * Represents a binary expression.
 *
 * Example:
 * 1 + 2
 */
export class BinaryExpressionOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly operator: BinaryOperator,
    public readonly left: Value,
    public readonly right: Value,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): BinaryExpressionOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(BinaryExpressionOp, place, this.operator, this.left, this.right);
  }

  rewrite(values: Map<Value, Value>): Operation {
    return new BinaryExpressionOp(
      this.id,
      this.place,
      this.operator,
      values.get(this.left) ?? this.left,
      values.get(this.right) ?? this.right,
    );
  }

  operands(): Value[] {
    return [this.left, this.right];
  }

  public override hasSideEffects(): boolean {
    return false;
  }

  public override print(): string {
    return `${this.place.print()} = binary "${this.operator}" ${this.left.print()}, ${this.right.print()}`;
  }
}
