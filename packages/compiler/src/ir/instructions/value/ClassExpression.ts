import { Environment } from "../../../environment";
import { BaseInstruction, InstructionId, ValueInstruction } from "../../base";
import { Identifier, Place } from "../../core";

export class ClassExpressionInstruction extends ValueInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly identifier: Place | null = null,
  ) {
    super(id, place);
  }

  public clone(environment: Environment): ClassExpressionInstruction {
    const newIdentifier = environment.createIdentifier();
    const place = environment.createPlace(newIdentifier);
    return environment.createInstruction(ClassExpressionInstruction, place, this.identifier);
  }

  rewrite(values: Map<Identifier, Place>): BaseInstruction {
    const newIdentifier = this.identifier ? this.identifier.rewrite(values) : null;
    if (newIdentifier === this.identifier) {
      return this;
    }
    return new ClassExpressionInstruction(this.id, this.place, newIdentifier);
  }

  getOperands(): Place[] {
    return [];
  }
}
