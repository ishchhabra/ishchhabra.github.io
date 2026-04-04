import { Environment } from "../../../environment";
import { BaseInstruction, InstructionId, JSXInstruction } from "../../base";
import { Place } from "../../core";

/**
 * Represents a JSX opening fragment in the IR.
 *
 * Examples:
 * - `<>`
 */
export class JSXOpeningFragmentInstruction extends JSXInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
  ) {
    super(id, place);
  }

  public clone(environment: Environment): JSXOpeningFragmentInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(JSXOpeningFragmentInstruction, place);
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
