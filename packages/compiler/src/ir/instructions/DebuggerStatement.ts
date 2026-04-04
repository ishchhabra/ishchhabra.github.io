import { Environment } from "../../environment";
import { BaseInstruction, InstructionId } from "../base";
import { Place } from "../core";

export class DebuggerStatementInstruction extends BaseInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
  ) {
    super(id, place);
  }

  public override hasSideEffects(): boolean {
    return true;
  }

  public clone(environment: Environment): DebuggerStatementInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(DebuggerStatementInstruction, place);
  }

  rewrite(): BaseInstruction {
    return this;
  }

  getOperands() {
    return [];
  }
}
