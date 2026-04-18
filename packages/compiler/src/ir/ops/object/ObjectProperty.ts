import { OperationId } from "../../core";
import { Value } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents an object property in the IR.
 *
 * Examples:
 * - `{ x: 1, y: 2 } // `x: 1` and `y: 2` are the object properties
 * - `{ a: b } = obj` // `a: b` in a destructuring pattern
 *
 * Non-computed keys are emitted as `LiteralOp`s in the IR so that
 * the property name survives SSA transformations (clone/rewrite) unchanged.
 * Computed keys (`[expr]`) remain ordinary expression places.
 */
export class ObjectPropertyOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly key: Value,
    public readonly value: Value,
    public readonly computed: boolean,
    public readonly shorthand: boolean,
    public readonly bindings: Value[] = [],
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): ObjectPropertyOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(
      ObjectPropertyOp,
      place,
      this.key,
      this.value,
      this.computed,
      this.shorthand,
      this.bindings,
    );
  }

  rewrite(values: Map<Value, Value>): Operation {
    return new ObjectPropertyOp(
      this.id,
      this.place,
      values.get(this.key) ?? this.key,
      values.get(this.value) ?? this.value,
      this.computed,
      this.shorthand,
      this.bindings.map((binding) => values.get(binding) ?? binding),
    );
  }

  getOperands(): Value[] {
    // In destructuring patterns, the value is a binding target (written, not read).
    // Only include it as a read when it's not one of the bindings.
    if (this.bindings.length > 0) {
      return [this.key];
    }
    return [this.key, this.value];
  }

  override getDefs(): Value[] {
    return [this.place, ...this.bindings];
  }

  public override print(): string {
    return `${this.place.print()} = ${this.key.print()}: ${this.value.print()}`;
  }
}
