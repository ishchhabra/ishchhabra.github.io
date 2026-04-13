import { OperationId } from "../../core";
import { Place } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents a meta property in the IR.
 *
 * Examples:
 * - `import.meta` (meta="import", property="meta")
 * - `new.target` (meta="new", property="target")
 */
export class MetaPropertyOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly meta: string,
    public readonly property: string,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): MetaPropertyOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(MetaPropertyOp, place, this.meta, this.property);
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
