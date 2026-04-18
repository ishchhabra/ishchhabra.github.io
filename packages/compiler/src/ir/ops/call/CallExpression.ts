import { OperationId } from "../../core";
import { Value } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents a call expression.
 *
 * Example:
 * foo(1, 2)
 */
export class CallExpressionOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly callee: Value,
    // Using args instead of arguments since arguments is a reserved word
    public readonly args: Value[],
    public readonly optional: boolean = false,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): CallExpressionOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(CallExpressionOp, place, this.callee, this.args, this.optional);
  }

  rewrite(values: Map<Value, Value>): Operation {
    return new CallExpressionOp(
      this.id,
      this.place,
      values.get(this.callee) ?? this.callee,
      this.args.map((arg) => values.get(arg) ?? arg),
      this.optional,
    );
  }

  getOperands(): Value[] {
    return [this.callee, ...this.args];
  }

  public override print(): string {
    return `${this.place.print()} = Call ${this.callee.print()}(${this.args.map((a) => a.print()).join(", ")})`;
  }
}
