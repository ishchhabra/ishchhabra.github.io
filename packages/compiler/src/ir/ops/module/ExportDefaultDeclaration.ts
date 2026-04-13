import { OperationId } from "../../core";
import { Place } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents an export default declaration.
 *
 * Example:
 * export default x;
 */
export class ExportDefaultDeclarationOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly declaration: Place,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): ExportDefaultDeclarationOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(
      ExportDefaultDeclarationOp,
      place,
      this.declaration,
    );
  }

  rewrite(): Operation {
    return this;
  }

  getOperands(): Place[] {
    return [this.declaration];
  }
}
