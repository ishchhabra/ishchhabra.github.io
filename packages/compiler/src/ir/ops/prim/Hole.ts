import { OperationId } from "../../core";
import { Place } from "../../core";
import { createOperationId } from "../../utils";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents a hole - an empty or missing value in an array.
 *
 * Example:
 * [1, , 3] // Second element is a hole
 */
export class HoleOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): HoleOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    const instructionId = createOperationId(moduleIR.environment);
    return new HoleOp(instructionId, place);
  }

  rewrite(): Operation {
    // Hole can not be rewritten.
    return this;
  }

  getOperands(): Place[] {
    return [];
  }

  public override hasSideEffects(): boolean {
    return false;
  }
}
