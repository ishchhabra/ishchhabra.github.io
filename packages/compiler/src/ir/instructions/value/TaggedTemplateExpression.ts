import type { ModuleIR } from "../../core/ModuleIR";
import { BaseInstruction, InstructionId, ValueInstruction } from "../../base";
import { Identifier, Place } from "../../core";

export class TaggedTemplateExpressionInstruction extends ValueInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly tag: Place,
    public readonly quasi: Place,
  ) {
    super(id, place);
  }

  public clone(moduleIR: ModuleIR): TaggedTemplateExpressionInstruction {
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createInstruction(
      TaggedTemplateExpressionInstruction,
      place,
      this.tag,
      this.quasi,
    );
  }

  rewrite(values: Map<Identifier, Place>): BaseInstruction {
    return new TaggedTemplateExpressionInstruction(
      this.id,
      this.place,
      values.get(this.tag.identifier) ?? this.tag,
      values.get(this.quasi.identifier) ?? this.quasi,
    );
  }

  getOperands(): Place[] {
    return [this.tag, this.quasi];
  }
}
