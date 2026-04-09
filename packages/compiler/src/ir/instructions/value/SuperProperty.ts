import { Environment } from "../../../environment";
import { BaseInstruction, InstructionId, ValueInstruction } from "../../base";
import { Identifier, Place } from "../../core";

/**
 * Represents a `super.foo` or `super[expr]` property access inside a class method.
 *
 * `super` is not a value — it cannot be stored, passed, or returned.
 * This instruction models the specific syntactic form `super.property` or
 * `super[expr]` as a first-class IR node so that no Place is created for
 * `super` itself.
 *
 * Non-computed keys (e.g. `super.foo`) use a LiteralInstruction Place for
 * the property, matching the convention used by ObjectPropertyInstruction
 * and ClassMethodInstruction.
 */
export class SuperPropertyInstruction extends ValueInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly property: Place,
    public readonly computed: boolean,
  ) {
    super(id, place);
  }

  public clone(environment: Environment): SuperPropertyInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(
      SuperPropertyInstruction,
      place,
      this.property,
      this.computed,
    );
  }

  rewrite(values: Map<Identifier, Place>): BaseInstruction {
    const newProperty = this.property.rewrite(values);
    if (newProperty === this.property) return this;
    return new SuperPropertyInstruction(this.id, this.place, newProperty, this.computed);
  }

  getOperands(): Place[] {
    return [this.property];
  }
}
