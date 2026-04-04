import { Environment } from "../../../environment";
import { BaseInstruction, InstructionId, ModuleInstruction } from "../../base";
import { Place } from "../../core";

/**
 * Represents an import specifier.
 *
 * Example:
 * import { x } from "y"; // x is the import specifier
 */
export class ImportSpecifierInstruction extends ModuleInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly local: string,
    public readonly imported: string,
  ) {
    super(id, place);
  }

  public clone(environment: Environment): ImportSpecifierInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(
      ImportSpecifierInstruction,
      place,
      this.local,
      this.imported,
    );
  }

  rewrite(): BaseInstruction {
    return this;
  }

  getOperands(): Place[] {
    return [];
  }
}
