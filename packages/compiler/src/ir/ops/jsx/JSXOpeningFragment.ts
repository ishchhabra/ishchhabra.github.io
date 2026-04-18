import { OperationId } from "../../core";
import { Value } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents a JSX opening fragment in the IR.
 *
 * Examples:
 * - `<>`
 */
export class JSXOpeningFragmentOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): JSXOpeningFragmentOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(JSXOpeningFragmentOp, place);
  }

  rewrite(): Operation {
    return this;
  }

  getOperands(): Value[] {
    return [];
  }

  public override hasSideEffects(): boolean {
    return false;
  }
}
