import type { ModuleIR } from "../../core/ModuleIR";
import { InstructionId, MemoryInstruction } from "../../base";
import { Identifier, Place } from "../../core";

/**
 * An instruction that stores a value into a **dynamic** property for an object:
 * `object[property]`.
 */
export class StoreDynamicPropertyInstruction extends MemoryInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly object: Place,
    public readonly property: Place,
    public readonly value: Place,
  ) {
    super(id, place);
  }

  public clone(moduleIR: ModuleIR): StoreDynamicPropertyInstruction {
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createInstruction(
      StoreDynamicPropertyInstruction,
      place,
      this.object,
      this.property,
      this.value,
    );
  }

  rewrite(values: Map<Identifier, Place>): StoreDynamicPropertyInstruction {
    return new StoreDynamicPropertyInstruction(
      this.id,
      this.place,
      values.get(this.object.identifier) ?? this.object,
      values.get(this.property.identifier) ?? this.property,
      values.get(this.value.identifier) ?? this.value,
    );
  }

  getOperands(): Place[] {
    return [this.object, this.property, this.value];
  }
}
