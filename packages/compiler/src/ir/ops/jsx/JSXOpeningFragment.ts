import { OperationId } from "../../core";
import { Place } from "../../core";

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
    public override readonly place: Place,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): JSXOpeningFragmentOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(JSXOpeningFragmentOp, place);
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
