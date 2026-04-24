import { OperationId } from "../../core";
import { Value } from "../../core";
import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents a spread element in the IR.
 *
 * Examples:
 * - `...foo`
 * - `...[1, 2, 3]`
 */
export class SpreadElementOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly argument: Value,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): SpreadElementOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(SpreadElementOp, place, this.argument);
  }

  rewrite(values: Map<Value, Value>): Operation {
    return new SpreadElementOp(this.id, this.place, values.get(this.argument) ?? this.argument);
  }

  operands(): Value[] {
    return [this.argument];
  }

  public override hasSideEffects(): boolean {
    return false;
  }
}
