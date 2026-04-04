import { Environment } from "../../../environment";
import { BaseInstruction, InstructionId, ValueInstruction } from "../../base";
import { Place } from "../../core";
import { createInstructionId } from "../../utils";

/**
 * Represents a hole - an empty or missing value in an array.
 *
 * Example:
 * [1, , 3] // Second element is a hole
 */
export class HoleInstruction extends ValueInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
  ) {
    super(id, place);
  }

  public clone(environment: Environment): HoleInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    const instructionId = createInstructionId(environment);
    return new HoleInstruction(instructionId, place);
  }

  rewrite(): BaseInstruction {
    // Hole can not be rewritten.
    return this;
  }

  getOperands(): Place[] {
    return [];
  }

  public override hasSideEffects(): boolean {
    return false;
  }
}
