import { OperationId } from "../../core";
import { Identifier, Place } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
export class NewExpressionOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly callee: Place,
    public readonly args: Place[],
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): NewExpressionOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(NewExpressionOp, place, this.callee, this.args);
  }

  rewrite(values: Map<Identifier, Place>): Operation {
    return new NewExpressionOp(
      this.id,
      this.place,
      values.get(this.callee.identifier) ?? this.callee,
      this.args.map((arg) => values.get(arg.identifier) ?? arg),
    );
  }

  getOperands(): Place[] {
    return [this.callee, ...this.args];
  }
}
