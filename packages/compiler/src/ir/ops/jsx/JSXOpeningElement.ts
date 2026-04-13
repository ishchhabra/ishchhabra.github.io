import { OperationId } from "../../core";
import { Identifier, Place } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents a JSX opening element in the IR.
 *
 * Examples:
 * - `<div className={x}>`
 * - `<MyComponent foo="bar" />`
 */
export class JSXOpeningElementOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly tagPlace: Place,
    public readonly attributes: Place[],
    public readonly selfClosing: boolean,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): JSXOpeningElementOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(
      JSXOpeningElementOp,
      place,
      this.tagPlace,
      this.attributes,
      this.selfClosing,
    );
  }

  public rewrite(values: Map<Identifier, Place>): Operation {
    return new JSXOpeningElementOp(
      this.id,
      this.place,
      values.get(this.tagPlace.identifier) ?? this.tagPlace,
      this.attributes.map((attr) => values.get(attr.identifier) ?? attr),
      this.selfClosing,
    );
  }

  public getOperands(): Place[] {
    return [this.tagPlace, ...this.attributes];
  }

  public override hasSideEffects(): boolean {
    return false;
  }
}
