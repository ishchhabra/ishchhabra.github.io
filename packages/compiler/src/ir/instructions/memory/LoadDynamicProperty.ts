import { Environment } from "../../../environment";
import { InstructionId, MemoryInstruction } from "../../base";
import { Identifier, Place } from "../../core";

/**
 * An instruction that loads a **dynamic** property for an object:
 * `object[property]`.
 */
export class LoadDynamicPropertyInstruction extends MemoryInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly object: Place,
    public readonly property: Place,
    public readonly optional: boolean = false,
  ) {
    super(id, place);
  }

  public clone(environment: Environment): LoadDynamicPropertyInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(
      LoadDynamicPropertyInstruction,
      place,
      this.object,
      this.property,
      this.optional,
    );
  }

  rewrite(values: Map<Identifier, Place>): LoadDynamicPropertyInstruction {
    return new LoadDynamicPropertyInstruction(
      this.id,
      this.place,
      values.get(this.object.identifier) ?? this.object,
      values.get(this.property.identifier) ?? this.property,
      this.optional,
    );
  }

  getReadPlaces(): Place[] {
    return [this.object, this.property];
  }

  public override print(): string {
    return `${this.place.print()} = ${this.object.print()}[${this.property.print()}]`;
  }
}
