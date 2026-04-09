import type { ModuleIR } from "../../core/ModuleIR";
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

  public clone(moduleIR: ModuleIR): ImportDeclarationInstruction {
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createInstruction(
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

  getOperands(): Place[] {
    return [...this.specifiers];
  }
}
