import { OperationId } from "../../core";
import { FunctionIR } from "../../core/FunctionIR";
import { Identifier } from "../../core/Identifier";
import { Place } from "../../core/Place";

import { Operation } from "../../core/Operation";
import { makeCloneContext, type CloneContext } from "../../core/Operation";
export class FunctionExpressionOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly identifier: Place | null,
    public readonly functionIR: FunctionIR,
    public readonly generator: boolean,
    public readonly async: boolean,
    public readonly captures: Place[] = [],
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): FunctionExpressionOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    // Recursively deep-clone the nested FunctionIR into the same target
    // module so the cloned function expression owns an independent body.
    return moduleIR.environment.createOperation(
      FunctionExpressionOp,
      place,
      this.identifier,
      this.functionIR.clone(makeCloneContext(moduleIR)),
      this.generator,
      this.async,
      this.captures,
    );
  }

  public rewrite(values: Map<Identifier, Place>): Operation {
    const newIdentifier = this.identifier ? this.identifier.rewrite(values) : null;
    const newCaptures = this.captures.map((c) => c.rewrite(values));

    const capturesChanged = newCaptures.some((c, i) => c !== this.captures[i]);
    const identifierChanged = newIdentifier !== this.identifier;
    if (!capturesChanged && !identifierChanged) {
      return this;
    }

    return new FunctionExpressionOp(
      this.id,
      this.place,
      newIdentifier,
      this.functionIR,
      this.generator,
      this.async,
      newCaptures,
    );
  }

  public getOperands(): Place[] {
    if (this.identifier !== null) {
      return [this.identifier, ...this.captures];
    }
    return this.captures;
  }

  public override getDefs(): Place[] {
    return [this.place];
  }

  public override hasSideEffects(): boolean {
    return false;
  }
}
