import { Environment } from "../../../environment";
import { BaseInstruction, InstructionId, ModuleInstruction } from "../../base";
import { Place } from "../../core";

/**
 * Represents an import declaration.
 *
 * Example:
 * import x from "y";
 * import { x } from "y";
 */
export class ImportDeclarationInstruction extends ModuleInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly source: string,
    public readonly resolvedSource: string,
    public readonly specifiers: Place[],
  ) {
    super(id, place);
  }

  public clone(environment: Environment): ImportDeclarationInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(
      ImportDeclarationInstruction,
      place,
      this.source,
      this.resolvedSource,
      this.specifiers,
    );
  }

  rewrite(): BaseInstruction {
    return this;
  }

  getReadPlaces(): Place[] {
    return [...this.specifiers];
  }
}
