import { Environment } from "../../../environment";
import { BaseInstruction, InstructionId, JSXInstruction } from "../../base";
import { Place } from "../../core";

/**
 * Represents a JSX text node in the IR.
 *
 * Examples:
 * - `"Hello, world!"`
 */
export class JSXTextInstruction extends JSXInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly value: string,
  ) {
    super(id, place);
  }

  public clone(environment: Environment): JSXTextInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(JSXTextInstruction, place, this.value);
  }

  rewrite(): BaseInstruction {
    // JSXText can not be rewritten.
    return this;
  }

  getReadPlaces(): Place[] {
    return [];
  }

  public override hasSideEffects(): boolean {
    return false;
  }
}
