import { OperationId } from "../../core";
import { Value } from "../../core";

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
    public override readonly place: Value,
    public readonly source: Value,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): ImportExpressionOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(ImportExpressionOp, place, this.source);
  }

  rewrite(values: Map<Value, Value>): Operation {
    return new ImportExpressionOp(this.id, this.place, values.get(this.source) ?? this.source);
  }

  getOperands(): Value[] {
    return [this.source];
  }
}
