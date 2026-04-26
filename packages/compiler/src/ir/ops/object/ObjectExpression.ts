import { OperationId } from "../../core";
import { Value } from "../../core";

import { Operation, Trait } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents an object expression.
 *
 * Example:
 * { a: 1, b: 2 }
 */
export class ObjectExpressionOp extends Operation {
  // Pure value construction: allocates a fresh object. Property
  // value computations are separate operations carrying their own
  // effects.
  static override readonly traits: ReadonlySet<Trait> = new Set([Trait.Pure]);

  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly properties: Value[],
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): ObjectExpressionOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(ObjectExpressionOp, place, this.properties);
  }

  rewrite(values: Map<Value, Value>): Operation {
    return new ObjectExpressionOp(
      this.id,
      this.place,
      this.properties.map((property) => values.get(property) ?? property),
    );
  }

  operands(): Value[] {
    return this.properties;
  }

  public override print(): string {
    return `${this.place.print()} = {${this.properties.map((p) => p.print()).join(", ")}}`;
  }
}
