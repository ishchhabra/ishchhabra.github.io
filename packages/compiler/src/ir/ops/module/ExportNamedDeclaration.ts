import { OperationId } from "../../core";
import { Place } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents an export named declaration.
 *
 * Example:
 * export { x };
 * export const y = 1;
 */
export class ExportNamedDeclarationOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly specifiers: Place[],
    public readonly declaration: Place | undefined,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): ExportNamedDeclarationOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(
      ExportNamedDeclarationOp,
      place,
      this.specifiers,
      this.declaration,
    );
  }

  rewrite(): Operation {
    return this;
  }

  getOperands(): Place[] {
    return [...this.specifiers, ...(this.declaration ? [this.declaration] : [])];
  }
}
