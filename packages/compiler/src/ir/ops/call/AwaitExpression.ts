import { OperationId } from "../../core";
import { Identifier, Place } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
export class AwaitExpressionOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly argument: Place,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): AwaitExpressionOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(AwaitExpressionOp, place, this.argument);
  }

  rewrite(values: Map<Identifier, Place>): Operation {
    return new AwaitExpressionOp(
      this.id,
      this.place,
      values.get(this.argument.identifier) ?? this.argument,
    );
  }

  getOperands(): Place[] {
    return [this.argument];
  }
}
