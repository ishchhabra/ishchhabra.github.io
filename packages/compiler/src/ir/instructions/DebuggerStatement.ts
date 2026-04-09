import type { ModuleIR } from "../core/ModuleIR";
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

  public clone(moduleIR: ModuleIR): DebuggerStatementInstruction {
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createInstruction(DebuggerStatementInstruction, place);
  }

  rewrite(): BaseInstruction {
    return this;
  }

  getOperands() {
    return [];
  }
}
