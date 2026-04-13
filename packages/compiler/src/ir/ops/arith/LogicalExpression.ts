import { OperationId } from "../../core";
import { Identifier, Place } from "../../core";

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
    public override readonly place: Place,
    public readonly operator: LogicalOperator,
    public readonly left: Place,
    public readonly right: Place,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): LogicalExpressionOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(
      LogicalExpressionOp,
      place,
      this.operator,
      this.left,
      this.right,
    );
  }

  rewrite(values: Map<Identifier, Place>): Operation {
    return new LogicalExpressionOp(
      this.id,
      this.place,
      this.operator,
      values.get(this.left.identifier) ?? this.left,
      values.get(this.right.identifier) ?? this.right,
    );
  }

  getOperands(): Place[] {
    return [this.left, this.right];
  }

  public override hasSideEffects(): boolean {
    return false;
  }
}
