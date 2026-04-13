import { OperationId } from "../../core";
import { Place } from "../../core";
import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
export class DebuggerStatementOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
  ) {
    super(id);
  }

  public override hasSideEffects(): boolean {
    return true;
  }

  public clone(ctx: CloneContext): DebuggerStatementOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(DebuggerStatementOp, place);
  }

  rewrite(): Operation {
    return this;
  }

  getOperands() {
    return [];
  }
}
