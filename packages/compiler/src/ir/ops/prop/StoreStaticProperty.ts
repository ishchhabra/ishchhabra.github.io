import { OperationId } from "../../core";
import { Identifier, Place } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * An instruction that stores a value into a **static** property for an object:
 * `object[0]` or `object.foo`.
 */
export class StoreStaticPropertyOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly object: Place,
    public readonly property: string,
    public readonly value: Place,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): StoreStaticPropertyOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(
      StoreStaticPropertyOp,
      place,
      this.object,
      this.property,
      this.value,
    );
  }

  rewrite(values: Map<Identifier, Place>): StoreStaticPropertyOp {
    return new StoreStaticPropertyOp(
      this.id,
      this.place,
      values.get(this.object.identifier) ?? this.object,
      this.property,
      values.get(this.value.identifier) ?? this.value,
    );
  }

  getOperands(): Place[] {
    return [this.object, this.value];
  }
}
