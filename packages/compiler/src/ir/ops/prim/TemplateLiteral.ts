import { OperationId } from "../../core";
import { Identifier, Place } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
export interface TemplateElementValue {
  raw: string;
  cooked?: string | null;
}

export interface TemplateElement {
  value: TemplateElementValue;
  tail: boolean;
}

export class TemplateLiteralOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly quasis: TemplateElement[],
    public readonly expressions: Place[],
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): TemplateLiteralOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(
      TemplateLiteralOp,
      place,
      this.quasis,
      this.expressions,
    );
  }

  rewrite(values: Map<Identifier, Place>): Operation {
    return new TemplateLiteralOp(
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
