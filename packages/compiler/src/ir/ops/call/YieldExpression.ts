import { OperationId } from "../../core";
import { Identifier, Place } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
export class YieldExpressionOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly argument: Place | undefined,
    public readonly delegate: boolean,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): YieldExpressionOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(
      YieldExpressionOp,
      place,
      this.argument,
      this.delegate,
    );
  }

  rewrite(values: Map<Identifier, Place>): Operation {
    return new YieldExpressionOp(
      this.id,
      this.place,
      this.argument ? (values.get(this.argument.identifier) ?? this.argument) : undefined,
      this.delegate,
    );
  }

  getOperands(): Place[] {
    return this.argument ? [this.argument] : [];
  }
}
