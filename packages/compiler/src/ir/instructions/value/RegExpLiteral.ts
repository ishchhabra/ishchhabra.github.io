import { Environment } from "../../../environment";
import { BaseInstruction, InstructionId, ValueInstruction } from "../../base";
import { Place } from "../../core";

export class RegExpLiteralInstruction extends ValueInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly pattern: string,
    public readonly flags: string,
  ) {
    super(id, place);
  }

  public clone(environment: Environment): RegExpLiteralInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(
      RegExpLiteralInstruction,
      place,
      this.pattern,
      this.flags,
    );
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
