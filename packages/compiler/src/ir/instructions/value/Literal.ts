import type { ModuleIR } from "../../core/ModuleIR";
import { BaseInstruction, InstructionId, ValueInstruction } from "../../base";
import { Place } from "../../core";

export type TPrimitiveValue = string | number | boolean | null | undefined | bigint | symbol;

/**
 * Represents a literal value.
 *
 * Example:
 * 42
 * "hello"
 * true
 */
export class LiteralInstruction extends ValueInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly value: TPrimitiveValue,
  ) {
    super(id, place);
  }

  public clone(moduleIR: ModuleIR): LiteralInstruction {
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createInstruction(LiteralInstruction, place, this.value);
  }

  rewrite(): BaseInstruction {
    // Literals can not be rewritten.
    return this;
  }

  getOperands(): Place[] {
    return [];
  }

  public override hasSideEffects(): boolean {
    return false;
  }

  public override print(): string {
    return `${this.place.print()} = ${JSON.stringify(this.value)}`;
  }
}
