import { Environment } from "../../../environment";
import { BaseInstruction, InstructionId, ValueInstruction } from "../../base";
import { Identifier, Place } from "../../core";

export class AwaitExpressionInstruction extends ValueInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly argument: Place,
  ) {
    super(id, place);
  }

  public clone(environment: Environment): AwaitExpressionInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(
      AwaitExpressionInstruction,
      place,
      this.argument,
    );
  }

  rewrite(values: Map<Identifier, Place>): BaseInstruction {
    return new AwaitExpressionInstruction(
      this.id,
      this.place,
      values.get(this.argument.identifier) ?? this.argument,
    );
  }

  getReadPlaces(): Place[] {
    return [this.argument];
  }
}
