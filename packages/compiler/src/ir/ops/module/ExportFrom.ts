import { OperationId } from "../../core";
import { Place } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
export interface ExportFromSpecifier {
  local: string;
  exported: string;
}

/**
 * Represents a re-export declaration.
 *
 * Example:
 * export { chunk, compact } from './array/utils.mjs';
 */
export class ExportFromOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly source: string,
    public specifiers: ExportFromSpecifier[],
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): ExportFromOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(ExportFromOp, place, this.source, [
      ...this.specifiers,
    ]);
  }

  rewrite(): Operation {
    return this;
  }

  getOperands(): Place[] {
    return [];
  }
}
