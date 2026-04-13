import { OperationId } from "../../core";
import { Place } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents an export declaration.
 *
 * Example:
 * export { x };
 * export const y = 1;
 * export * as z from "a";
 */
export class ExportDeclarationOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly specifiers: Place[],
    public readonly declaration: Place | undefined,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): ExportDeclarationOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(
      ExportDeclarationOp,
      place,
      this.specifiers,
      this.declaration,
    );
  }

  public rewrite(): ExportDeclarationOp {
    return this;
  }

  public getOperands(): Place[] {
    return this.specifiers;
  }
}
