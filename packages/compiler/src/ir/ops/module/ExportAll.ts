import { OperationId } from "../../core";
import { Value } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents an export-all re-export declaration.
 *
 * Example:
 * export * from './utils';
 * export * as utils from './utils';
 */
export class ExportAllOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly source: string,
    public readonly exportedName?: string,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): ExportAllOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(ExportAllOp, place, this.source, this.exportedName);
  }

  rewrite(): Operation {
    return this;
  }

  operands(): Value[] {
    return [];
  }
}
