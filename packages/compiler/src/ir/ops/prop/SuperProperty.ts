import { OperationId } from "../../core";
import { Identifier, Place } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents a `super.foo` or `super[expr]` property access inside a class method.
 *
 * `super` is not a value — it cannot be stored, passed, or returned.
 * This instruction models the specific syntactic form `super.property` or
 * `super[expr]` as a first-class IR node so that no Place is created for
 * `super` itself.
 *
 * Non-computed keys (e.g. `super.foo`) use a LiteralOp Place for
 * the property, matching the convention used by ObjectPropertyOp
 * and ClassMethodOp.
 */
export class SuperPropertyOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly property: Place,
    public readonly computed: boolean,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): SuperPropertyOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(
      SuperPropertyOp,
      place,
      this.property,
      this.computed,
    );
  }

  rewrite(values: Map<Identifier, Place>): Operation {
    const newProperty = this.property.rewrite(values);
    if (newProperty === this.property) return this;
    return new SuperPropertyOp(this.id, this.place, newProperty, this.computed);
  }

  getOperands(): Place[] {
    return [this.property];
  }
}
