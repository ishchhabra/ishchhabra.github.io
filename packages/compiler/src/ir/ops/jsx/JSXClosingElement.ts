import { OperationId } from "../../core";
import { Identifier, Place } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents a JSX closing element in the IR.
 *
 * Examples:
 * - `</div>`
 * - `</MyComponent>`
 */
export class JSXClosingElementOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly tagPlace: Place,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): JSXClosingElementOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(JSXClosingElementOp, place, this.tagPlace);
  }

  rewrite(values: Map<Identifier, Place>): Operation {
    return new JSXClosingElementOp(
      this.id,
      this.place,
      values.get(this.tagPlace.identifier) ?? this.tagPlace,
    );
  }

  getOperands(): Place[] {
    return [this.tagPlace];
  }

  public override hasSideEffects(): boolean {
    return false;
  }
}
