import { Environment } from "../../../environment";
import { BaseInstruction, InstructionId, ValueInstruction } from "../../base";
import { Place } from "../../core";

/**
 * Represents a meta property in the IR.
 *
 * Examples:
 * - `import.meta` (meta="import", property="meta")
 * - `new.target` (meta="new", property="target")
 */
export class MetaPropertyInstruction extends ValueInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly meta: string,
    public readonly property: string,
  ) {
    super(id, place);
  }

  public clone(environment: Environment): MetaPropertyInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(MetaPropertyInstruction, place, this.meta, this.property);
  }

  rewrite(): BaseInstruction {
    return this;
  }

  getOperands(): Place[] {
    return [];
  }

  public override hasSideEffects(): boolean {
    return false;
  }
}
