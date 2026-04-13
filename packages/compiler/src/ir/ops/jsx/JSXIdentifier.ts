import { OperationId } from "../../core";
import { Identifier, Place } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * JSX tag name after lowering: `value` is the place defined by a
 * `LiteralOp` (intrinsic string) or `LoadLocalOp` /
 * `LoadGlobalOp` / `LoadContextOp` (component reference).
 * This instruction’s `place` is what opening/member elements use as `tagPlace`;
 * codegen maps it to a `JSXIdentifier` (or coerces from literal/load output).
 */
export class JSXIdentifierOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly value: Place,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): JSXIdentifierOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(JSXIdentifierOp, place, this.value);
  }

  rewrite(values: Map<Identifier, Place>): Operation {
    const rewrittenValue = this.value.rewrite(values);
    if (rewrittenValue === this.value) {
      return this;
    }
    return new JSXIdentifierOp(this.id, this.place, rewrittenValue);
  }

  getOperands(): Place[] {
    return [this.value];
  }

  public override hasSideEffects(): boolean {
    return false;
  }
}
