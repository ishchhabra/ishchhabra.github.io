import { OperationId } from "../../core";
import { Place } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
export class RegExpLiteralOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly pattern: string,
    public readonly flags: string,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): RegExpLiteralOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(RegExpLiteralOp, place, this.pattern, this.flags);
  }

  rewrite(): Operation {
    return this;
  }

  getOperands(): Place[] {
    return [];
  }

  public override hasSideEffects(): boolean {
    return false;
  }
}
