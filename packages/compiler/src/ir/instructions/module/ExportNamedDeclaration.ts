import { Environment } from "../../../environment";
import { BaseInstruction, InstructionId, ModuleInstruction } from "../../base";
import { Place } from "../../core";

/**
 * Represents an export named declaration.
 *
 * Example:
 * export { x };
 * export const y = 1;
 */
export class ExportNamedDeclarationInstruction extends ModuleInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly specifiers: Place[],
    public readonly declaration: Place | undefined,
  ) {
    super(id, place);
  }

  public clone(environment: Environment): ExportNamedDeclarationInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(
      ExportNamedDeclarationInstruction,
      place,
      this.specifiers,
      this.declaration,
    );
  }

  rewrite(): BaseInstruction {
    return this;
  }

  getReadPlaces(): Place[] {
    return [...this.specifiers, ...(this.declaration ? [this.declaration] : [])];
  }
}
