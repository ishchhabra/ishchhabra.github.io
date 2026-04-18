import { OperationId } from "../../core";
import { Value } from "../../core";

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
    public override readonly place: Value,
    public readonly specifiers: Value[],
    public readonly declaration: Value | undefined,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): ExportNamedDeclarationOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(ExportNamedDeclarationOp, place, this.specifiers, this.declaration);
  }

  rewrite(): Operation {
    return this;
  }

  getOperands(): Value[] {
    return [...this.specifiers, ...(this.declaration ? [this.declaration] : [])];
  }
}
