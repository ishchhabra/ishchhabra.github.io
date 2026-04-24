import { OperationId } from "../../core";
import { Value } from "../../core";

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
    public override readonly place: Value,
    public readonly source: string,
    public specifiers: ExportFromSpecifier[],
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): ExportFromOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(ExportFromOp, place, this.source, [...this.specifiers]);
  }

  rewrite(): Operation {
    return this;
  }

  operands(): Value[] {
    return [];
  }
}
