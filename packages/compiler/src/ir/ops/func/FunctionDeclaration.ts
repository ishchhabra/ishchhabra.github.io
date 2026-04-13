import { FunctionIR } from "../../core/FunctionIR";
import { Identifier, Place } from "../../core";

import { Operation } from "../../core/Operation";
import { makeCloneContext, type CloneContext } from "../../core/Operation";
export class FunctionDeclarationOp extends Operation {
  constructor(
    public readonly id: import("../../core").OperationId,
    public override readonly place: Place,
    public readonly functionIR: FunctionIR,
    public readonly generator: boolean,
    public readonly async: boolean,
    public readonly captures: Place[] = [],
    public emit = true,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): FunctionDeclarationOp {
    const moduleIR = ctx.moduleIR;
    // Use a fresh declarationId — the clone is a distinct binding from the
    // original, not a new SSA version. Don't copy the original name either,
    // so the cloned function gets its own auto-generated `$<id>` name and
    // can't collide at codegen time.
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    // Recursively deep-clone the nested FunctionIR into the same target
    // module so the cloned declaration owns an independent body.
    return moduleIR.environment.createOperation(
      FunctionDeclarationOp,
      place,
      this.functionIR.clone(makeCloneContext(moduleIR)),
      this.generator,
      this.async,
      this.captures,
      this.emit,
    );
  }

  public rewrite(values: Map<Identifier, Place>): Operation {
    const newCaptures = this.captures.map((capture) => capture.rewrite(values));
    const capturesChanged = newCaptures.some((capture, index) => capture !== this.captures[index]);
    if (!capturesChanged) {
      return this;
    }

    return new FunctionDeclarationOp(
      this.id,
      this.place,
      this.functionIR,
      this.generator,
      this.async,
      newCaptures,
      this.emit,
    );
  }

  public getOperands(): Place[] {
    return this.captures;
  }

  public override getDefs(): Place[] {
    return [this.place];
  }
}
