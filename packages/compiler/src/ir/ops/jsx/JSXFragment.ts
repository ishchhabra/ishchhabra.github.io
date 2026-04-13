import { OperationId } from "../../core";
import { Identifier, Place } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents a JSX fragment in the IR.
 *
 * Examples:
 * - `<></>`
 * - `<>{foo}</>`
 */
export class JSXFragmentOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly openingFragment: Place,
    public readonly closingFragment: Place,
    public readonly children: Place[],
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): JSXFragmentOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(
      JSXFragmentOp,
      place,
      this.openingFragment,
      this.closingFragment,
      this.children,
    );
  }

  rewrite(values: Map<Identifier, Place>): JSXFragmentOp {
    return new JSXFragmentOp(
      this.id,
      this.place,
      this.openingFragment,
      this.closingFragment,
      this.children.map((child) => values.get(child.identifier) ?? child),
    );
  }

  getOperands(): Place[] {
    return [this.openingFragment, this.closingFragment, ...this.children];
  }

  public override hasSideEffects(): boolean {
    return false;
  }
}
