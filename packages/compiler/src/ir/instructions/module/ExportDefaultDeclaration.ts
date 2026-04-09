import type { ModuleIR } from "../../core/ModuleIR";
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

  public clone(moduleIR: ModuleIR): ExportDefaultDeclarationInstruction {
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createInstruction(
      ExportDefaultDeclarationInstruction,
      place,
      this.declaration,
    );
  }

  rewrite(): BaseInstruction {
    return this;
  }

  getOperands(): Place[] {
    return [this.declaration];
  }
}
