import { OperationId, type ImportName } from "../../core";
import { Value } from "../../core";
import type { DeclarationId } from "../../core/Value";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents an import specifier.
 *
 * Example:
 * import { x } from "y"; // x is the import specifier
 */
export class ImportSpecifierOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly localDeclarationId: DeclarationId,
    public readonly local: string,
    public readonly imported: ImportName,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): ImportSpecifierOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(
      ImportSpecifierOp,
      place,
      this.localDeclarationId,
      this.local,
      this.imported,
    );
  }

  rewrite(): Operation {
    return this;
  }

  operands(): Value[] {
    return [];
  }
}
