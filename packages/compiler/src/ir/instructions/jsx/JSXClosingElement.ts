import type { ModuleIR } from "../../core/ModuleIR";
import { BaseInstruction, InstructionId, JSXInstruction } from "../../base";
import { Identifier, Place } from "../../core";

/**
 * Represents a JSX closing element in the IR.
 *
 * Examples:
 * - `</div>`
 * - `</MyComponent>`
 */
export class JSXClosingElementInstruction extends JSXInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly tagPlace: Place,
  ) {
    super(id, place);
  }

  public clone(moduleIR: ModuleIR): JSXClosingElementInstruction {
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createInstruction(
      JSXClosingElementInstruction,
      place,
      this.tagPlace,
    );
  }

  rewrite(values: Map<Identifier, Place>): BaseInstruction {
    return new JSXClosingElementInstruction(
      this.id,
      this.place,
      values.get(this.tagPlace.identifier) ?? this.tagPlace,
    );
  }

  getOperands(): Place[] {
    return [this.tagPlace];
  }

  public override hasSideEffects(): boolean {
    return false;
  }
}
