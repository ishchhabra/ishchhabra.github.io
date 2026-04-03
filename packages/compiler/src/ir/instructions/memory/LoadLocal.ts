import { Environment } from "../../../environment";
import { BaseInstruction, InstructionId, MemoryInstruction } from "../../base";
import { Identifier, Place } from "../../core";

/**
 * Represents an instruction that loads a value from one place to another place.
 * This is used to move values between different memory locations in the IR.
 *
 * For example, when a variable is referenced, its value needs to be loaded from its storage location
 * to the place where it's being used.
 */
export class LoadLocalInstruction extends MemoryInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly value: Place,
  ) {
    super(id, place);
  }

  public clone(environment: Environment): LoadLocalInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(LoadLocalInstruction, place, this.value);
  }

  rewrite(values: Map<Identifier, Place>): BaseInstruction {
    const rewrittenTarget = values.get(this.value.identifier) ?? this.value;

    if (rewrittenTarget === this.value) {
      return this;
    }

    return new LoadLocalInstruction(this.id, this.place, rewrittenTarget);
  }

  getReadPlaces(): Place[] {
    return [this.value];
  }

  public override hasSideEffects(): boolean {
    return false;
  }

  public override print(): string {
    return `${this.place.print()} = LoadLocal ${this.value.print()}`;
  }
}
