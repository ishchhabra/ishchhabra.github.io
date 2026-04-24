import { OperationId } from "../../core";
import { Value } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
export class ThisExpressionOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): ThisExpressionOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(ThisExpressionOp, place);
  }

  rewrite(): Operation {
    return this;
  }

  operands(): Value[] {
    return [];
  }

  public override hasSideEffects(): boolean {
    return false;
  }
}
