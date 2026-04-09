import { BaseInstruction, Identifier, InstructionId, PatternInstruction, Place } from "../..";
import type { ModuleIR } from "../../core/ModuleIR";

/**
 * Represents an object pattern in the IR.
 *
 * Examples:
 * - `const { x, y } = { x: 1, y: 2 } // { x, y } is the object pattern`
 */
export class ObjectPatternInstruction extends PatternInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly properties: Place[],
    public readonly bindings: Place[] = [],
  ) {
    super(id, place);
  }

  public clone(moduleIR: ModuleIR): ObjectPatternInstruction {
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createInstruction(
      ObjectPatternInstruction,
      place,
      this.properties,
      this.bindings,
    );
  }

  rewrite(values: Map<Identifier, Place>): BaseInstruction {
    return new ObjectPatternInstruction(
      this.id,
      this.place,
      this.properties.map((property) => values.get(property.identifier) ?? property),
      this.bindings.map((binding) => values.get(binding.identifier) ?? binding),
    );
  }

  getOperands(): Place[] {
    return [];
  }

  override getDefs(): Place[] {
    return [this.place, ...this.bindings];
  }

  public override print(): string {
    return `${this.place.print()} = ObjectPattern {${this.properties.map((p) => p.print()).join(", ")}}`;
  }
}
