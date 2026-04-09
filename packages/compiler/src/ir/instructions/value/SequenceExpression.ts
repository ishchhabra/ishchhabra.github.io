import type { ModuleIR } from "../../core/ModuleIR";
import { BaseInstruction, InstructionId, ValueInstruction } from "../../base";
import { Identifier, Place } from "../../core";

export class SequenceExpressionInstruction extends ValueInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly expressions: Place[],
  ) {
    super(id, place);
  }

  public clone(moduleIR: ModuleIR): SequenceExpressionInstruction {
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createInstruction(
      SequenceExpressionInstruction,
      place,
      this.expressions,
    );
  }

  rewrite(values: Map<Identifier, Place>): BaseInstruction {
    return new SequenceExpressionInstruction(
      this.id,
      this.place,
      this.expressions.map((expr) => values.get(expr.identifier) ?? expr),
    );
  }

  getOperands(): Place[] {
    return [...this.expressions];
  }
}
