import { OperationId } from "../../core";
import { Identifier, Place } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents a JSX element in the IR.
 *
 * Examples:
 * - `<div />`
 * - `<div>Hello, world!</div>`
 */
export class JSXElementOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly openingElement: Place,
    public readonly closingElement: Place | undefined,
    public readonly children: Place[],
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): JSXElementOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(
      JSXElementOp,
      place,
      this.openingElement,
      this.closingElement,
      this.children,
    );
  }

  public rewrite(values: Map<Identifier, Place>): Operation {
    return new JSXElementOp(
      this.id,
      this.place,
      values.get(this.openingElement.identifier) ?? this.openingElement,
      this.closingElement
        ? (values.get(this.closingElement.identifier) ?? this.closingElement)
        : undefined,
      this.children.map((child) => values.get(child.identifier) ?? child),
    );
  }

  public getOperands(): Place[] {
    return [
      this.openingElement,
      ...(this.closingElement ? [this.closingElement] : []),
      ...this.children,
    ];
  }

  public override hasSideEffects(): boolean {
    return false;
  }
}
