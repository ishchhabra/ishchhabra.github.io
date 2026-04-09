import type { ModuleIR } from "../../core/ModuleIR";
import { BaseInstruction, InstructionId, PatternInstruction } from "../../base";
import { Identifier, Place } from "../../core";

/**
 * Represents an assignment pattern with a default value.
 *
 * Examples:
 * - `function foo(a = 1)` - Parameter default value
 * - `const {x = 1} = obj` - Destructuring with default value
 */
export class AssignmentPatternInstruction extends PatternInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly left: Place,
    public readonly right: Place,
    public readonly bindings: Place[] = [],
  ) {
    super(id, place);
  }

  public clone(moduleIR: ModuleIR): AssignmentPatternInstruction {
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createInstruction(
      AssignmentPatternInstruction,
      place,
      this.left,
      this.right,
      this.bindings,
    );
  }

  public rewrite(values: Map<Identifier, Place>): BaseInstruction {
    return new AssignmentPatternInstruction(
      this.id,
      this.place,
      values.get(this.left.identifier) ?? this.left,
      values.get(this.right.identifier) ?? this.right,
      this.bindings.map((binding) => values.get(binding.identifier) ?? binding),
    );
  }

  public getOperands(): Place[] {
    return [this.right];
  }

  public override getDefs(): Place[] {
    return [this.place, ...this.bindings];
  }

  public override hasSideEffects(): boolean {
    return false;
  }
}
