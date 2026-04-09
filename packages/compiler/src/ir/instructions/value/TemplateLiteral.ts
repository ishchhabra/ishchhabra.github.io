import type { ModuleIR } from "../../core/ModuleIR";
import { BaseInstruction, InstructionId, ValueInstruction } from "../../base";
import { Identifier, Place } from "../../core";

export interface TemplateElementValue {
  raw: string;
  cooked?: string | null;
}

export interface TemplateElement {
  value: TemplateElementValue;
  tail: boolean;
}

export class TemplateLiteralInstruction extends ValueInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly quasis: TemplateElement[],
    public readonly expressions: Place[],
  ) {
    super(id, place);
  }

  public clone(moduleIR: ModuleIR): TemplateLiteralInstruction {
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createInstruction(
      TemplateLiteralInstruction,
      place,
      this.quasis,
      this.expressions,
    );
  }

  rewrite(values: Map<Identifier, Place>): BaseInstruction {
    return new TemplateLiteralInstruction(
      this.id,
      this.place,
      this.quasis,
      this.expressions.map((expr) => values.get(expr.identifier) ?? expr),
    );
  }

  getOperands(): Place[] {
    return [...this.expressions];
  }

  public override hasSideEffects(): boolean {
    return false;
  }
}
