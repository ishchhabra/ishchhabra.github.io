import { OperationId } from "../../core";
import { Value } from "../../core";

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
    public override readonly place: Value,
    public readonly declaration: Value,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): ExportDefaultDeclarationOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(ExportDefaultDeclarationOp, place, this.declaration);
  }

  rewrite(): Operation {
    return this;
  }

  getOperands(): Value[] {
    return [this.declaration];
  }
}
