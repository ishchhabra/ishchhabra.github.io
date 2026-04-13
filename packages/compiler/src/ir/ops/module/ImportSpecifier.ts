import { OperationId } from "../../core";
import { Place } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents an import specifier.
 *
 * Example:
 * import { x } from "y"; // x is the import specifier
 */
export class ImportSpecifierOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly local: string,
    public readonly imported: string,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): ImportSpecifierOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(
      ImportSpecifierOp,
      place,
      this.local,
      this.imported,
    );
  }

  rewrite(): Operation {
    return this;
  }

  getOperands(): Place[] {
    return [];
  }
}
