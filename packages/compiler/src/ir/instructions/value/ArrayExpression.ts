import type { ModuleIR } from "../../core/ModuleIR";
import { BaseInstruction, InstructionId, ValueInstruction } from "../../base";
import { Identifier, Place } from "../../core";

/**
 * Represents an array expression.
 *
 * Example:
 * [1, 2, 3]
 */
export class ArrayExpressionInstruction extends ValueInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly elements: Place[],
  ) {
    super(id, place);
  }

  public clone(moduleIR: ModuleIR): ArrayExpressionInstruction {
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createInstruction(ArrayExpressionInstruction, place, this.elements);
  }

  rewrite(values: Map<Identifier, Place>): BaseInstruction {
    return new ArrayExpressionInstruction(
      this.id,
      this.place,
      this.elements.map((element) => values.get(element.identifier) ?? element),
    );
  }

  getOperands(): Place[] {
    return this.elements;
  }

  public override hasSideEffects(): boolean {
    return false;
  }

  public override print(): string {
    return `${this.place.print()} = [${this.elements.map((e) => (e ? e.print() : "<hole>")).join(", ")}]`;
  }
}
