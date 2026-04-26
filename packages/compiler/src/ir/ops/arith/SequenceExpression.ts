import { Value, OperationId } from "../../core";
import type { CloneContext } from "../../core/Operation";
import { Operation } from "../../core/Operation";

export class SequenceExpressionOp extends Operation {
  // The op itself just selects the last operand's value; the
  // inter-operand evaluations were materialized as their own ops
  // with their own effects.

  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly expressions: Value[],
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): SequenceExpressionOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(SequenceExpressionOp, place, this.expressions);
  }

  rewrite(values: Map<Value, Value>): Operation {
    return new SequenceExpressionOp(
      this.id,
      this.place,
      this.expressions.map((expr) => values.get(expr) ?? expr),
    );
  }

  operands(): Value[] {
    return [...this.expressions];
  }

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
