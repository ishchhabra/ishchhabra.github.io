import { Environment } from "../../../environment";
import { BaseInstruction, InstructionId, ValueInstruction } from "../../base";
import { Identifier, Place } from "../../core";

/**
 * Represents an object property in the IR.
 *
 * Examples:
 * - `{ x: 1, y: 2 } // `x: 1` and `y: 2` are the object properties
 * - `{ a: b } = obj` // `a: b` in a destructuring pattern
 *
 * Non-computed keys are emitted as `LiteralInstruction`s in the IR so that
 * the property name survives SSA transformations (clone/rewrite) unchanged.
 * Computed keys (`[expr]`) remain ordinary expression places.
 */
export class ObjectPropertyInstruction extends ValueInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly key: Place,
    public readonly value: Place,
    public readonly computed: boolean,
    public readonly shorthand: boolean,
    public readonly bindings: Place[] = [],
  ) {
    super(id, place);
  }

  public clone(environment: Environment): ObjectPropertyInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(
      ObjectPropertyInstruction,
      place,
      this.key,
      this.value,
      this.computed,
      this.shorthand,
      this.bindings,
    );
  }

  rewrite(values: Map<Identifier, Place>): BaseInstruction {
    return new ObjectPropertyInstruction(
      this.id,
      this.place,
      values.get(this.key.identifier) ?? this.key,
      values.get(this.value.identifier) ?? this.value,
      this.computed,
      this.shorthand,
      this.bindings.map((binding) => values.get(binding.identifier) ?? binding),
    );
  }

  getReadPlaces(): Place[] {
    // In destructuring patterns, the value is a binding target (written, not read).
    // Only include it as a read when it's not one of the bindings.
    if (this.bindings.length > 0) {
      return [this.key];
    }
    return [this.key, this.value];
  }

  override getWrittenPlaces(): Place[] {
    return [this.place, ...this.bindings];
  }

  public override print(): string {
    return `${this.place.print()} = ${this.key.print()}: ${this.value.print()}`;
  }
}
