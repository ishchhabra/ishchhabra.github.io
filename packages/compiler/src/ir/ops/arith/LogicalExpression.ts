import { OperationId, Value } from "../../core";
import type { CloneContext } from "../../core/Operation";
import { Operation } from "../../core/Operation";

export type LogicalOperator = "&&" | "||" | "??";

export class LogicalExpressionOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly operator: LogicalOperator,
    public readonly left: Value,
    public readonly right: Value,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): LogicalExpressionOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(LogicalExpressionOp, place, this.operator, this.left, this.right);
  }

  rewrite(values: Map<Value, Value>): Operation {
    return new LogicalExpressionOp(
      this.id,
      this.place,
      this.operator,
      values.get(this.left) ?? this.left,
      values.get(this.right) ?? this.right,
    );
  }

  operands(): Value[] {
    return [this.left, this.right];
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

  public override print(): string {
    return `${this.place.print()} = logical "${this.operator}" ${this.left.print()}, ${this.right.print()}`;
  }
}
