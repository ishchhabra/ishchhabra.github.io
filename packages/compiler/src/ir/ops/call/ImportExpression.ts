import { OperationId } from "../../core";
import { Identifier, Place } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents a dynamic import expression.
 *
 * Example:
 * import("./module")
 */
export class ImportExpressionOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly source: Place,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): ImportExpressionOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(ImportExpressionOp, place, this.source);
  }

  rewrite(values: Map<Identifier, Place>): Operation {
    return new ImportExpressionOp(
      this.id,
      this.place,
      values.get(this.source.identifier) ?? this.source,
    );
  }

  getOperands(): Place[] {
    return [this.source];
  }
}
