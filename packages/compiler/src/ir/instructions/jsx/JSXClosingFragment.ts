import { Environment } from "../../../environment";
import { BaseInstruction, InstructionId, JSXInstruction } from "../../base";
import { Place } from "../../core";

/**
 * Represents a JSX closing fragment in the IR.
 *
 * Examples:
 * - `</>`
 */
export class JSXClosingFragmentInstruction extends JSXInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
  ) {
    super(id, place);
  }

  public clone(environment: Environment): JSXClosingFragmentInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(JSXClosingFragmentInstruction, place);
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
