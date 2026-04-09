import type { ModuleIR } from "../../core/ModuleIR";
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

  public clone(moduleIR: ModuleIR): ImportExpressionInstruction {
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createInstruction(ImportExpressionInstruction, place, this.source);
  }

  rewrite(values: Map<Identifier, Place>): BaseInstruction {
    return new ImportExpressionInstruction(
      this.id,
      this.place,
      values.get(this.source.identifier) ?? this.source,
    );
  }

  getOperands(): Place[] {
    return [this.source];
  }
}
