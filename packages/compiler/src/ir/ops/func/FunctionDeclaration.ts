import { FuncOp } from "../../core/FuncOp";
import { Value } from "../../core";

import { Operation } from "../../core/Operation";
import { makeCloneContext, requireModuleIR, type CloneContext } from "../../core/Operation";
export class FunctionDeclarationOp extends Operation {
  constructor(
    public readonly id: import("../../core").OperationId,
    public override readonly place: Value,
    public readonly funcOp: FuncOp,
    public readonly generator: boolean,
    public readonly async: boolean,
    public readonly captures: Value[] = [],
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): FunctionDeclarationOp {
    const moduleIR = requireModuleIR(ctx);
    const env = moduleIR.environment;
    // Use a fresh declarationId — the clone is a distinct binding from the
    // original, not a new SSA version. Don't copy the original name either,
    // so the cloned function gets its own auto-generated `$<id>` name and
    // can't collide at codegen time.
    const place = env.createValue();
    // Recursively deep-clone the nested FuncOp into the same target
    // module so the cloned declaration owns an independent body.
    return env.createOperation(
      FunctionDeclarationOp,
      place,
      this.funcOp.clone(makeCloneContext(moduleIR)),
      this.generator,
      this.async,
      this.captures,
    );
  }

  public rewrite(values: Map<Value, Value>): Operation {
    const newCaptures = this.captures.map((capture) => capture.rewrite(values));
    const capturesChanged = newCaptures.some((capture, index) => capture !== this.captures[index]);
    if (!capturesChanged) {
      return this;
    }

    return new FunctionDeclarationOp(
      this.id,
      this.place,
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
}
