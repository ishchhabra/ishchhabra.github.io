import { OperationId } from "../../core";
import { Value } from "../../core";

import { Operation, Trait } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents an array expression.
 *
 * Example:
 * [1, 2, 3]
 */
export class ArrayExpressionOp extends Operation {
  // Pure value construction: allocates a new Array literal. Element
  // expressions (including spreads, which iterate) are separate
  // operations with their own effects; this op itself doesn't read
  // or write anywhere observable.
  static override readonly traits: ReadonlySet<Trait> = new Set([Trait.Pure]);

  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly elements: Value[],
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): ArrayExpressionOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(ArrayExpressionOp, place, this.elements);
  }

  rewrite(values: Map<Value, Value>): Operation {
    return new ArrayExpressionOp(
      this.id,
      this.place,
      this.elements.map((element) => values.get(element) ?? element),
    );
  }

  operands(): Value[] {
    return this.elements;
  }

  public override print(): string {
    return `${this.place.print()} = [${this.elements.map((e) => (e ? e.print() : "<hole>")).join(", ")}]`;
  }
}
