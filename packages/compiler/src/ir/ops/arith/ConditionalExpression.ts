import { OperationId, Value } from "../../core";
import type { CloneContext } from "../../core/Operation";
import { Operation } from "../../core/Operation";

export class ConditionalExpressionOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly test: Value,
    public readonly consequent: Value,
    public readonly alternate: Value,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): ConditionalExpressionOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(
      ConditionalExpressionOp,
      place,
      this.test,
      this.consequent,
      this.alternate,
    );
  }

  rewrite(values: Map<Value, Value>): Operation {
    return new ConditionalExpressionOp(
      this.id,
      this.place,
      values.get(this.test) ?? this.test,
      values.get(this.consequent) ?? this.consequent,
      values.get(this.alternate) ?? this.alternate,
    );
  }

  operands(): Value[] {
    return [this.test, this.consequent, this.alternate];
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
    return `${this.place.print()} = conditional ${this.test.print()} ? ${this.consequent.print()} : ${this.alternate.print()}`;
  }
}
