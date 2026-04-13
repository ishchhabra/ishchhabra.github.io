import { OperationId } from "../../core";
import { Place } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents a JSX namespaced name in the IR.
 *
 * Examples:
 * - `svg:rect` in `<svg:rect>`
 * - `xml:space` in `<xml:space>`
 */
export class JSXNamespacedNameOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly namespace: string,
    public readonly name: string,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): JSXNamespacedNameOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(
      JSXNamespacedNameOp,
      place,
      this.namespace,
      this.name,
    );
  }

  rewrite(): Operation {
    return this;
  }

  getOperands(): Place[] {
    return [];
  }

  public override hasSideEffects(): boolean {
    return false;
  }
}
