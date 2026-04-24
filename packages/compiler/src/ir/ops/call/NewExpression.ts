import { OperationId } from "../../core";
import { Value } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
export class NewExpressionOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly callee: Value,
    public readonly args: Value[],
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): NewExpressionOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(NewExpressionOp, place, this.callee, this.args);
  }

  rewrite(values: Map<Value, Value>): Operation {
    return new NewExpressionOp(
      this.id,
      this.place,
      values.get(this.callee) ?? this.callee,
      this.args.map((arg) => values.get(arg) ?? arg),
    );
  }

  operands(): Value[] {
    return [this.callee, ...this.args];
  }
}
