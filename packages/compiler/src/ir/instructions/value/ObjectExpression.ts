import type { ModuleIR } from "../../core/ModuleIR";
import { BaseInstruction, InstructionId, ValueInstruction } from "../../base";
import { Identifier, Place } from "../../core";

/**
 * Represents an object expression.
 *
 * Example:
 * { a: 1, b: 2 }
 */
export class ObjectExpressionInstruction extends ValueInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly properties: Place[],
  ) {
    super(id, place);
  }

  public clone(moduleIR: ModuleIR): ObjectExpressionInstruction {
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createInstruction(
      ObjectExpressionInstruction,
      place,
      this.properties,
    );
  }

  rewrite(values: Map<Identifier, Place>): BaseInstruction {
    return new ObjectExpressionInstruction(
      this.id,
      this.place,
      this.properties.map((property) => values.get(property.identifier) ?? property),
    );
  }

  getOperands(): Place[] {
    return this.properties;
  }

  public override hasSideEffects(): boolean {
    return false;
  }

  public override print(): string {
    return `${this.place.print()} = {${this.properties.map((p) => p.print()).join(", ")}}`;
  }
}
