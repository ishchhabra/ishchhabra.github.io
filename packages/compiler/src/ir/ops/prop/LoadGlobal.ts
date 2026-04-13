import { OperationId } from "../../core";
import { Place } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents a memory instruction that loads a value for a global variable to a place.
 *
 * For example, when `console.log` is referenced, its value needs to be loaded from the global scope
 * before it can be used.
 */
export class LoadGlobalOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly name: string,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): LoadGlobalOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(LoadGlobalOp, place, this.name);
  }

  rewrite(): Operation {
    // LoadGlobal can not be rewritten.
    return this;
  }

  getOperands(): Place[] {
    return [];
  }

  public override hasSideEffects(): boolean {
    return false;
  }

  public override print(): string {
    return `${this.place.print()} = LoadGlobal ${this.name}`;
  }
}
