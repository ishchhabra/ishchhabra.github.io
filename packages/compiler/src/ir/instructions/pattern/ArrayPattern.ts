import type { ModuleIR } from "../../core/ModuleIR";
import { BaseInstruction, InstructionId, PatternInstruction } from "../../base";
import { Identifier, Place } from "../../core";

/**
 * Represents an array pattern in the IR.
 *
 * Examples:
 * - `const [x, y] = [1, 2] // [x, y] is the array pattern`
 */
export class ArrayPatternInstruction extends PatternInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly elements: (Place | null)[],
    public readonly bindings: Place[] = [],
  ) {
    super(id, place);
  }

  public clone(moduleIR: ModuleIR): ArrayPatternInstruction {
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createInstruction(
      ArrayPatternInstruction,
      place,
      this.elements,
      this.bindings,
    );
  }

  rewrite(values: Map<Identifier, Place>): BaseInstruction {
    return new ArrayPatternInstruction(
      this.id,
      this.place,
      this.elements.map((element) =>
        element === null ? null : (values.get(element.identifier) ?? element),
      ),
      this.bindings.map((binding) => values.get(binding.identifier) ?? binding),
    );
  }

  getOperands(): Place[] {
    return [];
  }

  override getDefs(): Place[] {
    return [this.place, ...this.bindings];
  }

  public override hasSideEffects(): boolean {
    return false;
  }

  public override print(): string {
    return `${this.place.print()} = ArrayPattern [${this.elements.map((e) => (e ? e.print() : "<hole>")).join(", ")}]`;
  }
}
