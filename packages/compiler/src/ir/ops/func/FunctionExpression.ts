import { OperationId, Value } from "../../core";
import { FuncOp } from "../../core/FuncOp";
import { Operation } from "../../core/Operation";
import { makeCloneContext, requireModuleIR, type CloneContext } from "../../core/Operation";

export class FunctionExpressionOp extends Operation {
  // Pure value creation: allocating a function has no observable
  // side effects.

  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly name: string | null,
    public readonly funcOp: FuncOp,
    public readonly generator: boolean,
    public readonly async: boolean,
    public readonly captures: Value[] = [],
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): FunctionExpressionOp {
    const moduleIR = requireModuleIR(ctx);
    const env = moduleIR.environment;
    const place = env.createValue();
    // Recursively deep-clone the nested FuncOp into the same target
    // module so the cloned function expression owns an independent body.
    return env.createOperation(
      FunctionExpressionOp,
      place,
      this.name,
      this.funcOp.clone(makeCloneContext(moduleIR)),
      this.generator,
      this.async,
      this.captures,
    );
  }

  public rewrite(values: Map<Value, Value>): Operation {
    const newCaptures = this.captures.map((c) => c.rewrite(values));
    const capturesChanged = newCaptures.some((c, i) => c !== this.captures[i]);
    if (!capturesChanged) return this;

    return new FunctionExpressionOp(
      this.id,
      this.place,
      this.name,
      this.funcOp,
      this.generator,
      this.async,
      newCaptures,
    );
  }

  public operands(): Value[] {
    return this.captures;
  }

  public override results(): Value[] {
    return [this.place];
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
