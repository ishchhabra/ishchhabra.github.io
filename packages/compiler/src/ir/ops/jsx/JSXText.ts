import { OperationId } from "../../core";
import { Place } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents a JSX text node in the IR.
 *
 * Examples:
 * - `"Hello, world!"`
 */
export class JSXTextOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly value: string,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): JSXTextOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(JSXTextOp, place, this.value);
  }

  rewrite(): Operation {
    // JSXText can not be rewritten.
    return this;
  }

  getOperands(): Place[] {
    return [];
  }

  public override hasSideEffects(): boolean {
    return false;
  }
}
