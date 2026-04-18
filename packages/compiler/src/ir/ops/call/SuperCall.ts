import { OperationId } from "../../core";
import { Value } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents a `super(args)` call inside a derived class constructor.
 *
 * `super` is not a value — it cannot be stored, passed, or returned.
 * This instruction models the specific syntactic form `super(...)` as a
 * first-class IR node so that no Value is created for `super` itself.
 *
 * The result `place` represents the return value of the super call
 * (the newly constructed instance).
 */
export class SuperCallOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly args: Value[],
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): SuperCallOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(SuperCallOp, place, this.args);
  }

  rewrite(values: Map<Value, Value>): Operation {
    const newArgs = this.args.map((arg) => arg.rewrite(values));
    const changed = newArgs.some((a, i) => a !== this.args[i]);
    if (!changed) return this;
    return new SuperCallOp(this.id, this.place, newArgs);
  }

  getOperands(): Value[] {
    return this.args;
  }
}
