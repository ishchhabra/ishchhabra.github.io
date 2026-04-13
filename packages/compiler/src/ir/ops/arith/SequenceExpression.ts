import { OperationId } from "../../core";
import { Identifier, Place } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
export class SequenceExpressionOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly expressions: Place[],
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): SequenceExpressionOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(SequenceExpressionOp, place, this.expressions);
  }

  rewrite(values: Map<Identifier, Place>): Operation {
    return new SequenceExpressionOp(
      this.id,
      this.place,
      this.expressions.map((expr) => values.get(expr.identifier) ?? expr),
    );
  }

  getOperands(): Place[] {
    return [...this.expressions];
  }
}
