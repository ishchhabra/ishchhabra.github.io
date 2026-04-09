import type { ModuleIR } from "../../core/ModuleIR";
import { BaseInstruction, InstructionId, ValueInstruction } from "../../base";
import { Identifier, Place } from "../../core";

export class YieldExpressionInstruction extends ValueInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly argument: Place | undefined,
    public readonly delegate: boolean,
  ) {
    super(id, place);
  }

  public clone(moduleIR: ModuleIR): YieldExpressionInstruction {
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createInstruction(
      YieldExpressionInstruction,
      place,
      this.argument,
      this.delegate,
    );
  }

  rewrite(values: Map<Identifier, Place>): BaseInstruction {
    return new YieldExpressionInstruction(
      this.id,
      this.place,
      this.argument ? (values.get(this.argument.identifier) ?? this.argument) : undefined,
      this.delegate,
    );
  }

  getOperands(): Place[] {
    return this.argument ? [this.argument] : [];
  }
}
