import { OperationId } from "../../core";
import { Value } from "../../core";

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
    public override readonly place: Value,
    public readonly source: string,
    public readonly resolvedSource: string,
    public readonly specifiers: Value[],
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): ImportDeclarationOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(
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

  operands(): Value[] {
    return [...this.specifiers];
  }
}
