import { OperationId } from "../../core";
import { Value } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
export class AwaitExpressionOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly argument: Value,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): AwaitExpressionOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(AwaitExpressionOp, place, this.argument);
  }

  rewrite(values: Map<Value, Value>): Operation {
    return new AwaitExpressionOp(this.id, this.place, values.get(this.argument) ?? this.argument);
  }

  getOperands(): Value[] {
    return [this.argument];
  }
}
