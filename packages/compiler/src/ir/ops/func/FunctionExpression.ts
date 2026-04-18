import { OperationId, Value } from "../../core";
import { FuncOp } from "../../core/FuncOp";
import { Operation } from "../../core/Operation";
import { makeCloneContext, requireModuleIR, type CloneContext } from "../../core/Operation";

export class FunctionExpressionOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    /** Optional bound name for `function foo() {}`. `null` for anonymous expressions. */
    public readonly binding: Value | null,
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
      this.binding,
      this.funcOp.clone(makeCloneContext(moduleIR)),
      this.generator,
      this.async,
      this.captures,
    );
  }

  public rewrite(values: Map<Value, Value>): Operation {
    const newBinding = this.binding ? this.binding.rewrite(values) : null;
    const newCaptures = this.captures.map((c) => c.rewrite(values));

    const capturesChanged = newCaptures.some((c, i) => c !== this.captures[i]);
    const bindingChanged = newBinding !== this.binding;
    if (!capturesChanged && !bindingChanged) {
      return this;
    }

    return new FunctionExpressionOp(
      this.id,
      this.place,
      newBinding,
      this.funcOp,
      this.generator,
      this.async,
      newCaptures,
    );
  }

  public getOperands(): Value[] {
    if (this.binding !== null) {
      return [this.binding, ...this.captures];
    }
    return this.captures;
  }

  public override getDefs(): Value[] {
    return [this.place];
  }

  public override hasSideEffects(): boolean {
    return false;
  }
}
