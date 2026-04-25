import { OperationId } from "../../core";
import { Value } from "../../core";

import { Operation } from "../../core/Operation";
import { remapPlace, type CloneContext } from "../../core/Operation";
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
    public readonly local: Value,
    public readonly exported: string,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): ExportSpecifierOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(
      ExportSpecifierOp,
      place,
      remapPlace(ctx, this.local),
      this.exported,
    );
  }

  rewrite(values: Map<Value, Value>): Operation {
    const local = values.get(this.local) ?? this.local;
    if (local === this.local) return this;
    return new ExportSpecifierOp(this.id, this.place, local, this.exported);
  }

  operands(): Value[] {
    return [this.local];
  }
}
