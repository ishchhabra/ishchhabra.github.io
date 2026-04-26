import { OperationId } from "../../core";
import { Value } from "../../core";

import { Operation, Trait } from "../../core/Operation";
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
  static override readonly traits: ReadonlySet<Trait> = new Set([Trait.Pure]);

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

}
