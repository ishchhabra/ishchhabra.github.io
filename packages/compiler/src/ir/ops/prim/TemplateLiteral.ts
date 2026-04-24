import { OperationId } from "../../core";
import { Value } from "../../core";

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
    public override readonly place: Value,
    public readonly quasis: TemplateElement[],
    public readonly expressions: Value[],
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): TemplateLiteralOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(TemplateLiteralOp, place, this.quasis, this.expressions);
  }

  rewrite(values: Map<Value, Value>): Operation {
    return new TemplateLiteralOp(
      this.id,
      this.place,
      this.quasis,
      this.expressions.map((expr) => values.get(expr) ?? expr),
    );
  }

  operands(): Value[] {
    return [...this.expressions];
  }

  public override hasSideEffects(): boolean {
    return false;
  }
}
