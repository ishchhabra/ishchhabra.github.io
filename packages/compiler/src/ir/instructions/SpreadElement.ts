import type { ModuleIR } from "../core/ModuleIR";
import { BaseInstruction, InstructionId } from "../base";
import { Identifier, Place } from "../core";

/**
 * Represents a spread element in the IR.
 *
 * Examples:
 * - `...foo`
 * - `...[1, 2, 3]`
 */
export class SpreadElementInstruction extends BaseInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly argument: Place,
  ) {
    super(id, place);
  }

  public clone(moduleIR: ModuleIR): SpreadElementInstruction {
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createInstruction(SpreadElementInstruction, place, this.argument);
  }

  rewrite(values: Map<Identifier, Place>): BaseInstruction {
    return new SpreadElementInstruction(
      this.id,
      this.place,
      values.get(this.argument.identifier) ?? this.argument,
    );
  }

  getOperands(): Place[] {
    return [this.argument];
  }

  public override hasSideEffects(): boolean {
    return false;
  }
}
