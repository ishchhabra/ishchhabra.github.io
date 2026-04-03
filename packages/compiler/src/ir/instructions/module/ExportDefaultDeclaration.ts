import { Environment } from "../../../environment";
import { BaseInstruction, InstructionId, ModuleInstruction } from "../../base";
import { Place } from "../../core";

/**
 * Represents an export default declaration.
 *
 * Example:
 * export default x;
 */
export class ExportDefaultDeclarationInstruction extends ModuleInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly declaration: Place,
  ) {
    super(id, place);
  }

  public clone(environment: Environment): ExportDefaultDeclarationInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(
      ExportDefaultDeclarationInstruction,
      place,
      this.declaration,
    );
  }

  rewrite(): BaseInstruction {
    return this;
  }

  getReadPlaces(): Place[] {
    return [this.declaration];
  }
}
