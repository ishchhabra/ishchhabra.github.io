import { OperationId } from "../../core";
import { Identifier, Place } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents an instruction that loads a value from one place to another place.
 * This is used to move values between different memory locations in the IR.
 *
 * For example, when a variable is referenced, its value needs to be loaded from its storage location
 * to the place where it's being used.
 */
export class LoadLocalOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly value: Place,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): LoadLocalOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(LoadLocalOp, place, this.value);
  }

  rewrite(values: Map<Identifier, Place>): Operation {
    const rewrittenTarget = values.get(this.value.identifier) ?? this.value;

    if (rewrittenTarget === this.value) {
      return this;
    }

    return new LoadLocalOp(this.id, this.place, rewrittenTarget);
  }

  getOperands(): Place[] {
    return [this.value];
  }

  public override hasSideEffects(): boolean {
    return false;
  }

  public override print(): string {
    return `${this.place.print()} = LoadLocal ${this.value.print()}`;
  }
}
