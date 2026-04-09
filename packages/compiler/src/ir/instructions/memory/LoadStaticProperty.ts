import type { ModuleIR } from "../../core/ModuleIR";
import { InstructionId, MemoryInstruction } from "../../base";
import { Identifier, Place } from "../../core";

/**
 * An instruction that loads a **static** property for an object:
 * `object[0]` or `object.foo`.
 */
export class LoadStaticPropertyInstruction extends MemoryInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly object: Place,
    public readonly property: string,
    public readonly optional: boolean = false,
  ) {
    super(id, place);
  }

  public clone(moduleIR: ModuleIR): LoadStaticPropertyInstruction {
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createInstruction(
      LoadStaticPropertyInstruction,
      place,
      this.object,
      this.property,
      this.optional,
    );
  }

  rewrite(values: Map<Identifier, Place>): LoadStaticPropertyInstruction {
    return new LoadStaticPropertyInstruction(
      this.id,
      this.place,
      values.get(this.object.identifier) ?? this.object,
      this.property,
      this.optional,
    );
  }

  getOperands(): Place[] {
    return [this.object];
  }

  public override print(): string {
    return `${this.place.print()} = ${this.object.print()}.${this.property}`;
  }
}
