import { Environment } from "../../../environment";
import { InstructionId, ModuleInstruction } from "../../base";
import { Place } from "../../core";

/**
 * Represents an export declaration.
 *
 * Example:
 * export { x };
 * export const y = 1;
 * export * as z from "a";
 */
export class ExportDeclarationInstruction extends ModuleInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly specifiers: Place[],
    public readonly declaration: Place | undefined,
  ) {
    super(id, place);
  }

  public clone(environment: Environment): ExportDeclarationInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(
      ExportDeclarationInstruction,
      place,
      this.specifiers,
      this.declaration,
    );
  }

  public rewrite(): ExportDeclarationInstruction {
    return this;
  }

  public getOperands(): Place[] {
    return this.specifiers;
  }
}
