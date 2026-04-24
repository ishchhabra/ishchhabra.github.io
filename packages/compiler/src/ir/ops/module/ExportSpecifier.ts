import { OperationId } from "../../core";
import { Value } from "../../core";
import type { DeclarationId } from "../../core/Value";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents an export specifier.
 *
 * Example:
 * export { x }; // x is the export specifier
 */
export class ExportSpecifierOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly localDeclarationId: DeclarationId,
    public readonly exported: string,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): ExportSpecifierOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(ExportSpecifierOp, place, this.localDeclarationId, this.exported);
  }

  rewrite(): Operation {
    return this;
  }

  operands(): Value[] {
    return [];
  }
}
