import { OperationId } from "../../core";
import { Identifier, Place } from "../../core";

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
    public override readonly place: Place,
    public readonly key: Place,
    public readonly value: Place,
    public readonly computed: boolean,
    public readonly shorthand: boolean,
    public readonly bindings: Place[] = [],
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): ObjectPropertyOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(
      ObjectPropertyOp,
      place,
      this.key,
      this.value,
      this.computed,
      this.shorthand,
      this.bindings,
    );
  }

  rewrite(values: Map<Identifier, Place>): Operation {
    return new ObjectPropertyOp(
      this.id,
      this.place,
      values.get(this.key.identifier) ?? this.key,
      values.get(this.value.identifier) ?? this.value,
      this.computed,
      this.shorthand,
      this.bindings.map((binding) => values.get(binding.identifier) ?? binding),
    );
  }

  getOperands(): Place[] {
    // In destructuring patterns, the value is a binding target (written, not read).
    // Only include it as a read when it's not one of the bindings.
    if (this.bindings.length > 0) {
      return [this.key];
    }
    return [this.key, this.value];
  }

  override getDefs(): Place[] {
    return [this.place, ...this.bindings];
  }

  public override print(): string {
    return `${this.place.print()} = ${this.key.print()}: ${this.value.print()}`;
  }
}
