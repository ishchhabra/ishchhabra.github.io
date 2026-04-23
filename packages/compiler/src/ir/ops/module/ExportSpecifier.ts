import { OperationId } from "../../core";
import { Value } from "../../core";

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
    public readonly localPlace: Value,
    public readonly exported: string,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): ExportSpecifierOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(ExportSpecifierOp, place, this.localPlace, this.exported);
  }

  rewrite(values: Map<Value, Value>): Operation {
    const next = values.get(this.localPlace) ?? this.localPlace;
    if (next === this.localPlace) return this;
    return new ExportSpecifierOp(this.id, this.place, next, this.exported);
  }

  getOperands(): Value[] {
    return [this.localPlace];
  }
}
