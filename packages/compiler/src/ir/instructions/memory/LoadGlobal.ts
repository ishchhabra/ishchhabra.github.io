import type { ModuleIR } from "../../core/ModuleIR";
import { BaseInstruction, InstructionId, MemoryInstruction } from "../../base";
import { Place } from "../../core";

/**
 * Represents a memory instruction that loads a value for a global variable to a place.
 *
 * For example, when `console.log` is referenced, its value needs to be loaded from the global scope
 * before it can be used.
 */
export class LoadGlobalInstruction extends MemoryInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly name: string,
  ) {
    super(id, place);
  }

  public clone(moduleIR: ModuleIR): LoadGlobalInstruction {
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createInstruction(LoadGlobalInstruction, place, this.name);
  }

  rewrite(): BaseInstruction {
    // LoadGlobal can not be rewritten.
    return this;
  }

  getOperands(): Place[] {
    return [];
  }

  public override hasSideEffects(): boolean {
    return false;
  }

  public override print(): string {
    return `${this.place.print()} = LoadGlobal ${this.name}`;
  }
}
