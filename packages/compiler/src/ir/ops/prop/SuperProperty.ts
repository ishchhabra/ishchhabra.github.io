import { OperationId } from "../../core";
import { Value } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents a `super.foo` or `super[expr]` property access inside a class method.
 *
 * `super` is not a value — it cannot be stored, passed, or returned.
 * This instruction models the specific syntactic form `super.property` or
 * `super[expr]` as a first-class IR node so that no Value is created for
 * `super` itself.
 *
 * Non-computed keys (e.g. `super.foo`) use a LiteralOp Value for
 * the property, matching the convention used by ObjectPropertyOp
 * and ClassMethodOp.
 */
export class SuperPropertyOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly property: Value,
    public readonly computed: boolean,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): SuperPropertyOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(SuperPropertyOp, place, this.property, this.computed);
  }

  rewrite(values: Map<Value, Value>): Operation {
    const newProperty = this.property.rewrite(values);
    if (newProperty === this.property) return this;
    return new SuperPropertyOp(this.id, this.place, newProperty, this.computed);
  }

  getOperands(): Value[] {
    return [this.property];
  }

  public override print(): string {
    const attrs = this.computed ? ` {computed}` : "";
    return `${this.place.print()} = super_property ${this.property.print()}${attrs}`;
  }
}
