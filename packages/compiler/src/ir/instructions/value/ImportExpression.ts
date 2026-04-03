import { Environment } from "../../../environment";
import { BaseInstruction, InstructionId, ValueInstruction } from "../../base";
import { Identifier, Place } from "../../core";

/**
 * Represents a dynamic import expression.
 *
 * Example:
 * import("./module")
 */
export class ImportExpressionInstruction extends ValueInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly source: Place,
  ) {
    super(id, place);
  }

  public clone(environment: Environment): ImportExpressionInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(
      ImportExpressionInstruction,
      place,
      this.source,
    );
  }

  rewrite(values: Map<Identifier, Place>): BaseInstruction {
    return new ImportExpressionInstruction(
      this.id,
      this.place,
      values.get(this.source.identifier) ?? this.source,
    );
  }

  getReadPlaces(): Place[] {
    return [this.source];
  }
}
