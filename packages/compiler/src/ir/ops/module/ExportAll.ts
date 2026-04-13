import { OperationId } from "../../core";
import { Place } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents an export-all re-export declaration.
 *
 * Example:
 * export * from './utils';
 */
export class ExportAllOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly source: string,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): ExportAllOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(ExportAllOp, place, this.source);
  }

  rewrite(): Operation {
    return this;
  }

  getOperands(): Place[] {
    return [];
  }
}
