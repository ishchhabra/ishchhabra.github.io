import { OperationId } from "../../core";
import { Value } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
export type LogicalOperator = "||" | "&&" | "??";

/**
 * Represents a logical expression.
 *
 * Example:
 * a && b
 * a || b
 */
export class LogicalExpressionOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly operator: LogicalOperator,
    public readonly left: Value,
    public readonly right: Value,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): LogicalExpressionOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(LogicalExpressionOp, place, this.operator, this.left, this.right);
  }

  rewrite(values: Map<Value, Value>): Operation {
    return new LogicalExpressionOp(
      this.id,
      this.place,
      this.operator,
      values.get(this.left) ?? this.left,
      values.get(this.right) ?? this.right,
    );
  }

  getOperands(): Value[] {
    return [this.left, this.right];
  }

  public override hasSideEffects(): boolean {
    return false;
  }
}
