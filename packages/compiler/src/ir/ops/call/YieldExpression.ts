import { OperationId } from "../../core";
import { Value } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
export class YieldExpressionOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly argument: Value | undefined,
    public readonly delegate: boolean,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): YieldExpressionOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(YieldExpressionOp, place, this.argument, this.delegate);
  }

  rewrite(values: Map<Value, Value>): Operation {
    return new YieldExpressionOp(
      this.id,
      this.place,
      this.argument ? (values.get(this.argument) ?? this.argument) : undefined,
      this.delegate,
    );
  }

  getOperands(): Value[] {
    return this.argument ? [this.argument] : [];
  }
}
