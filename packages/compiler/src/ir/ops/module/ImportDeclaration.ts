import { OperationId } from "../../core";
import { Place } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents an import declaration.
 *
 * Example:
 * import x from "y";
 * import { x } from "y";
 */
export class ImportDeclarationOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly source: string,
    public readonly resolvedSource: string,
    public readonly specifiers: Place[],
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): ImportDeclarationOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(
      ImportDeclarationOp,
      place,
      this.source,
      this.resolvedSource,
      this.specifiers,
    );
  }

  rewrite(): Operation {
    return this;
  }

  getOperands(): Place[] {
    return [...this.specifiers];
  }
}
