import { OperationId } from "../../core";
import { Value } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
export class TaggedTemplateExpressionOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly tag: Value,
    public readonly quasi: Value,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): TaggedTemplateExpressionOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(TaggedTemplateExpressionOp, place, this.tag, this.quasi);
  }

  rewrite(values: Map<Value, Value>): Operation {
    return new TaggedTemplateExpressionOp(
      this.id,
      this.place,
      values.get(this.tag) ?? this.tag,
      values.get(this.quasi) ?? this.quasi,
    );
  }

  getOperands(): Value[] {
    return [this.tag, this.quasi];
  }
}
