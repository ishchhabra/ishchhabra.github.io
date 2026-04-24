import { OperationId } from "../../core";
import { Value } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents a meta property in the IR.
 *
 * Examples:
 * - `import.meta` (meta="import", property="meta")
 * - `new.target` (meta="new", property="target")
 */
export class MetaPropertyOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly meta: string,
    public readonly property: string,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): MetaPropertyOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(MetaPropertyOp, place, this.meta, this.property);
  }

  rewrite(): Operation {
    return this;
  }

  operands(): Value[] {
    return [];
  }

  public override hasSideEffects(): boolean {
    return false;
  }
}
