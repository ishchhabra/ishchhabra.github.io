import { OperationId } from "../../core";
import { Value } from "../../core";
import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
export class DebuggerStatementOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
  ) {
    super(id);
  }

  public override hasSideEffects(): boolean {
    return true;
  }

  public clone(ctx: CloneContext): DebuggerStatementOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(DebuggerStatementOp, place);
  }

  rewrite(): Operation {
    return this;
  }

  getOperands() {
    return [];
  }
}
