import { Environment } from "../../../environment";
import { BaseInstruction, InstructionId, ValueInstruction } from "../../base";
import { Identifier, Place } from "../../core";

export class SequenceExpressionInstruction extends ValueInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly expressions: Place[],
  ) {
    super(id, place);
  }

  public clone(environment: Environment): SequenceExpressionInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(
      SequenceExpressionInstruction,
      place,
      this.expressions,
    );
  }

  rewrite(values: Map<Identifier, Place>): BaseInstruction {
    return new SequenceExpressionInstruction(
      this.id,
      this.place,
      this.expressions.map((expr) => values.get(expr.identifier) ?? expr),
    );
  }

  getReadPlaces(): Place[] {
    return [...this.expressions];
  }
}
