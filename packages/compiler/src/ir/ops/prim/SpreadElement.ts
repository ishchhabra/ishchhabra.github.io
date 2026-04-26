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

  // Five-axis effects: spread invokes the iterator protocol which
  // can in principle throw on non-iterable arguments. The existing
  // optimizer treats spread as non-throwing (a deliberate
  // optimization decision); we preserve that per-axis. Memory
  // effects can in principle touch the iterable's state, but we
  // don't model iterator memory; treat as no static reads/writes.
  public override getMemoryEffects(): import("../../memory/MemoryLocation").MemoryEffects {
    return { reads: [], writes: [] };
  }
  public override mayThrow(): boolean {
    return false;
  }
  public override mayDiverge(): boolean {
    return false;
  }
  public override get isDeterministic(): boolean {
    return true;
  }
  public override isObservable(): boolean {
    return false;
  }
}
