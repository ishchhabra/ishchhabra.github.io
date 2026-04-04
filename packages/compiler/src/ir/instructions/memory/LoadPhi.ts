import { Environment } from "../../../environment";
import { InstructionId, MemoryInstruction } from "../../base";
import { Identifier, Place } from "../../core";

export class LoadPhiInstruction extends MemoryInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly value: Place,
  ) {
    super(id, place);
  }

  public clone(environment: Environment): LoadPhiInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(LoadPhiInstruction, place, this.value);
  }

  rewrite(values: Map<Identifier, Place>): LoadPhiInstruction {
    return new LoadPhiInstruction(
      this.id,
      this.place,
      values.get(this.value.identifier) ?? this.value,
    );
  }

  getOperands(): Place[] {
    return [this.value];
  }

  public override hasSideEffects(): boolean {
    return false;
  }

  public override print(): string {
    return `${this.place.print()} = LoadPhi ${this.value.print()}`;
  }
}
