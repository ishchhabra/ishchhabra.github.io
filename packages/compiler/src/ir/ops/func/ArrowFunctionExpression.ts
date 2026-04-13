import { OperationId } from "../../core";
import { FunctionIR } from "../../core/FunctionIR";
import { Identifier } from "../../core/Identifier";
import { Place } from "../../core/Place";

import { Operation } from "../../core/Operation";
import { makeCloneContext, type CloneContext } from "../../core/Operation";
/**
 * Represents an arrow function expression, e.g.
 *   `const arrow = (x) => x + 1;`
 *
 * `captures` are the outer-scope Places this closure reads from,
 * aligned by index with `functionIR.runtime.captureParams`. Codegen binds
 * `captureParams[i]` → `captures[i]` so the function body resolves
 * captured variables through the indirection layer.
 */
export class ArrowFunctionExpressionOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly functionIR: FunctionIR,
    public readonly async: boolean,
    public readonly expression: boolean,
    public readonly generator: boolean,
    public readonly captures: Place[] = [],
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): ArrowFunctionExpressionOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    // Recursively deep-clone the nested FunctionIR into the same target
    // module so the inlined / cloned arrow doesn't share its body with
    // the source. The clone self-registers in `moduleIR.functions`.
    return moduleIR.environment.createOperation(
      ArrowFunctionExpressionOp,
      place,
      this.functionIR.clone(makeCloneContext(moduleIR)),
      this.async,
      this.expression,
      this.generator,
      this.captures,
    );
  }

  public rewrite(values: Map<Identifier, Place>): Operation {
    const newCaptures = this.captures.map((c) => c.rewrite(values));
    const capturesChanged = newCaptures.some((c, i) => c !== this.captures[i]);

    if (!capturesChanged) {
      return this;
    }

    return new ArrowFunctionExpressionOp(
      this.id,
      this.place,
      this.functionIR,
      this.async,
      this.expression,
      this.generator,
      newCaptures,
    );
  }

  public getOperands(): Place[] {
    return this.captures;
  }

  public override hasSideEffects(): boolean {
    return false;
  }
}
