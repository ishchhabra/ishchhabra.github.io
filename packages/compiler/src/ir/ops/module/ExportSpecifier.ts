import { OperationId } from "../../core";
import { Place } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents an export specifier.
 *
 * Example:
 * export { x }; // x is the export specifier
 */
export class ExportSpecifierOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly localPlace: Place,
    public readonly exported: string,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): ExportSpecifierOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(
      ExportSpecifierOp,
      place,
      this.localPlace,
      this.exported,
    );
  }

  rewrite(): Operation {
    return this;
  }

  getOperands(): Place[] {
    return [this.localPlace];
  }
}
