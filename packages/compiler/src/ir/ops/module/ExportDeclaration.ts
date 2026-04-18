import { OperationId } from "../../core";
import { Value } from "../../core";

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
    public override readonly place: Value,
    public readonly specifiers: Value[],
    public readonly declaration: Value | undefined,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): ExportDeclarationOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(ExportDeclarationOp, place, this.specifiers, this.declaration);
  }

  public rewrite(): ExportDeclarationOp {
    return this;
  }

  public getOperands(): Value[] {
    return this.specifiers;
  }
}
