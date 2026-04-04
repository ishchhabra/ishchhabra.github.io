import { Environment } from "../../../environment";
import { InstructionId, MemoryInstruction } from "../../base";
import { Identifier, Place } from "../../core";

/**
 * An instruction that stores a value into a **static** property for an object:
 * `object[0]` or `object.foo`.
 */
export class StoreStaticPropertyInstruction extends MemoryInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly object: Place,
    public readonly property: string,
    public readonly value: Place,
  ) {
    super(id, place);
  }

  public clone(environment: Environment): StoreStaticPropertyInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(
      StoreStaticPropertyInstruction,
      place,
      this.object,
      this.property,
      this.value,
    );
  }

  rewrite(values: Map<Identifier, Place>): StoreStaticPropertyInstruction {
    return new StoreStaticPropertyInstruction(
      this.id,
      this.place,
      values.get(this.object.identifier) ?? this.object,
      this.property,
      values.get(this.value.identifier) ?? this.value,
    );
  }

  getOperands(): Place[] {
    return [this.object, this.value];
  }
}
