import { OperationId } from "../../core";
import { Identifier, Place } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
export class LoadPhiOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly value: Place,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): LoadPhiOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(LoadPhiOp, place, this.value);
  }

  rewrite(values: Map<Identifier, Place>): LoadPhiOp {
    return new LoadPhiOp(this.id, this.place, values.get(this.value.identifier) ?? this.value);
  }

  getOperands(): Place[] {
    return [this.value];
  }

  public override hasSideEffects(): boolean {
    return false;
  }

  public override print(): string {
    return `${this.place.print()} = LoadPhi ${this.value.print()}`;
  }
}
